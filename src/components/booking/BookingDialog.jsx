import { useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, UserRound, X } from "lucide-react";
import Modal from "../common/Modal";
import {
  checkScheduleCreationLimit,
  createSchedulesAtomically,
  insertRow,
  isBookingSlotUnavailableError,
  isBookingSlotTakenError,
  queryRows,
  reminderCountForBusinessRow,
  shouldBlockN8nForBusinessRow,
  toJsonSafe,
} from "../../lib/firestore";
import { createBookingViaApi, isBookingApiEnabled } from "../../lib/bookingApi";
import { asDateOnly, firstText, formatMoney, overlaps, parseDate, parseTimeOnDate, sameMinute, toInt, toNumber } from "../../lib/marketplace";
import { captureEvent } from "../../lib/posthog";
import { measureAsync, queuePerfEvent } from "../../lib/observability";

const SEARCH_HORIZON_DAYS = 60;
const WINDOW_DAYS = 7;
const SLOTS_PER_PAGE = 6;

function statusCanceled(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "cancelado" || normalized === "canceled" || normalized === "cancelled";
}

function normalizePhoneDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeLabel(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function monthLabel(date) {
  const text = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function weekDayLabel(date) {
  const text = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function durationLabel(minutes) {
  const safe = Math.max(0, minutes || 0);
  const hours = Math.trunc(safe / 60);
  const remaining = safe % 60;
  if (hours === 0) return `${safe}min`;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}min`;
}

function serviceDuration(service) {
  const value = toInt(service?.duracao_minutos);
  return value && value > 0 ? value : 30;
}

function periodForTime(date) {
  if (date.getHours() < 12) return "manha";
  if (date.getHours() < 18) return "tarde";
  return "noite";
}

function matchesPeriod(date, period) {
  if (period === "manha") return date.getHours() < 12;
  if (period === "tarde") return date.getHours() >= 12 && date.getHours() < 18;
  if (period === "noite") return date.getHours() >= 18;
  return true;
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function scheduleDayKey(value) {
  if (!value) return null;
  if (value instanceof Date) return dateKey(asDateOnly(value));

  const text = String(value).trim();
  const prefix = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (prefix) return prefix[1];

  const parsed = parseDate(text);
  if (!parsed) return null;
  return dateKey(asDateOnly(parsed));
}

function workerPhoto(worker) {
  const candidates = [
    worker?.photo_url,
    worker?.photoUrl,
    worker?.foto_url,
    worker?.foto,
    worker?.avatar_url,
    worker?.avatarUrl,
    worker?.image_url,
    worker?.imageUrl,
  ];

  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text.startsWith("http")) return text;
  }

  return null;
}

export default function BookingDialog({
  isOpen,
  businessId,
  initialServiceId = null,
  initialCustomerName = "",
  initialCustomerWhatsapp = "",
  onClose,
  onSuccess,
}) {
  const posthog = usePostHog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [askingCustomer, setAskingCustomer] = useState(false);
  const [error, setError] = useState("");

  const [today, setToday] = useState(() => asDateOnly(new Date()));
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workerServiceMap, setWorkerServiceMap] = useState({});
  const [businessRow, setBusinessRow] = useState({});

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedStart, setSelectedStart] = useState(null);
  const [slotStates, setSlotStates] = useState([]);
  const [slotConflict, setSlotConflict] = useState(false);

  const [dateOffset, setDateOffset] = useState(0);
  const [slotOffset, setSlotOffset] = useState(0);
  const [period, setPeriod] = useState("manha");
  const [dateCounts, setDateCounts] = useState({});

  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [addServiceOptions, setAddServiceOptions] = useState([]);
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [lastName, setLastName] = useState("");
  const [lastWhatsapp, setLastWhatsapp] = useState("");

  const dayCacheRef = useRef(new Map());
  const slotsCacheRef = useRef(new Map());
  const scheduleRowsCacheRef = useRef(new Map());
  const refreshTokenRef = useRef(0);

  const serviceById = useMemo(() => {
    const map = {};
    for (const service of services) {
      map[service.id] = service;
    }
    return map;
  }, [services]);

  const selectedServices = useMemo(
    () => selectedServiceIds.map((serviceId) => serviceById[serviceId]).filter(Boolean),
    [selectedServiceIds, serviceById],
  );

  const totalDuration = useMemo(
    () => selectedServices.reduce((sum, service) => sum + serviceDuration(service), 0),
    [selectedServices],
  );

  const totalPrice = useMemo(
    () => selectedServices.reduce((sum, service) => sum + toNumber(service.preco), 0),
    [selectedServices],
  );

  const workerIdsSorted = useMemo(
    () => workers.slice().sort((a, b) => String(a?.nome ?? "").localeCompare(String(b?.nome ?? ""))).map((worker) => worker.id),
    [workers],
  );

  const slotsByPeriod = useMemo(
    () => slotStates.filter((slot) => matchesPeriod(slot.start, period)),
    [slotStates, period],
  );

  const visibleSlots = useMemo(() => {
    const maxOffset = Math.max(0, Math.floor(Math.max(0, slotsByPeriod.length - 1) / SLOTS_PER_PAGE) * SLOTS_PER_PAGE);
    const safeOffset = Math.min(slotOffset, maxOffset);
    return slotsByPeriod.slice(safeOffset, safeOffset + SLOTS_PER_PAGE);
  }, [slotOffset, slotsByPeriod]);

  const timelineRows = useMemo(() => {
    if (!selectedStart) return [];
    const rows = [];
    let cursor = new Date(selectedStart);
    for (const serviceId of selectedServiceIds) {
      const service = serviceById[serviceId];
      if (!service) continue;
      const end = new Date(cursor.getTime() + serviceDuration(service) * 60000);
      rows.push({ serviceId, start: cursor, end });
      cursor = end;
    }
    return rows;
  }, [selectedStart, selectedServiceIds, serviceById]);

  function analyticsProps(extra = {}) {
    return {
      business_id: businessId,
      initial_service_id: initialServiceId ?? undefined,
      worker_id: selectedWorkerId ?? undefined,
      selected_service_ids: selectedServiceIds,
      selected_service_count: selectedServiceIds.length,
      selected_date: selectedDate ? dateKey(selectedDate) : undefined,
      selected_start: selectedStart ? timeLabel(selectedStart) : undefined,
      total_duration_minutes: totalDuration,
      total_price: totalPrice,
      booking_mode: isBookingApiEnabled() ? "backend" : "client",
      ...extra,
    };
  }

  function clearAvailabilityCache() {
    dayCacheRef.current.clear();
    slotsCacheRef.current.clear();
    scheduleRowsCacheRef.current.clear();
    setDateCounts({});
    setSlotStates([]);
  }

  async function schedulesForWorkerDay(workerId, date) {
    const targetDateKey = dateKey(date);
    const key = `${workerId}|${targetDateKey}`;
    if (scheduleRowsCacheRef.current.has(key)) {
      return scheduleRowsCacheRef.current.get(key);
    }

    const rows = await queryRows({
      table: "agendamentos",
      conditions: [
        { field: "trabalhador_id", operator: "eq", value: workerId },
        { field: "business_id", operator: "eq", value: businessId },
        { field: "data_agendamento", operator: "eq", value: targetDateKey },
      ],
    });

    scheduleRowsCacheRef.current.set(key, rows);
    return rows;
  }

  async function daySchedule(workerId, date) {
    const key = `${workerId}|${dateKey(date)}`;
    if (dayCacheRef.current.has(key)) {
      return dayCacheRef.current.get(key) ?? null;
    }

    const weekDay = date.getDay();
    const targetDateKey = dateKey(date);

    const workRows = await queryRows({
      table: "horarios_padrao",
      conditions: [
        { field: "trabalhador_id", operator: "eq", value: workerId },
        { field: "dia_semana", operator: "eq", value: weekDay },
        { field: "business_id", operator: "eq", value: businessId },
        { field: "ativo", operator: "eq", value: true },
      ],
    });

    if (workRows.length === 0) {
      dayCacheRef.current.set(key, null);
      return null;
    }

    const work = workRows[0];
    let workStart = parseTimeOnDate(date, work.hora_inicio ?? work.start_time ?? work.start);
    let workEnd = parseTimeOnDate(date, work.hora_fim ?? work.end_time ?? work.end);
    if (!workStart || !workEnd || workEnd <= workStart) {
      dayCacheRef.current.set(key, null);
      return null;
    }

    let breakStart = parseTimeOnDate(date, work.intervalo_inicio ?? work.hora_pausa_inicio ?? work.break_start ?? work.lunch_start);
    let breakEnd = parseTimeOnDate(date, work.intervalo_fim ?? work.hora_pausa_fim ?? work.break_end ?? work.lunch_end);

    const exceptionRows = await queryRows({
      table: "horarios_excecoes",
      conditions: [
        { field: "trabalhador_id", operator: "eq", value: workerId },
        { field: "data", operator: "eq", value: targetDateKey },
        { field: "business_id", operator: "eq", value: businessId },
      ],
    });

    const hasDayOff = exceptionRows.some((entry) => String(entry?.tipo ?? "").trim().toLowerCase() === "folga");
    if (hasDayOff) {
      dayCacheRef.current.set(key, null);
      return null;
    }

    for (const entry of exceptionRows) {
      if (String(entry?.tipo ?? "").trim().toLowerCase() !== "personalizado") continue;

      const customStart = parseTimeOnDate(date, entry.hora_inicio ?? entry.start_time);
      const customEnd = parseTimeOnDate(date, entry.hora_fim ?? entry.end_time);
      if (customStart && customEnd && customEnd > customStart) {
        workStart = customStart;
        workEnd = customEnd;
      }

      const customBreakStart = parseTimeOnDate(date, entry.intervalo_inicio ?? entry.hora_pausa_inicio ?? entry.break_start);
      const customBreakEnd = parseTimeOnDate(date, entry.intervalo_fim ?? entry.hora_pausa_fim ?? entry.break_end);
      if (customBreakStart && customBreakEnd && customBreakEnd > customBreakStart) {
        breakStart = customBreakStart;
        breakEnd = customBreakEnd;
      }
    }

    const blocked = [];

    for (const entry of exceptionRows) {
      if (String(entry?.tipo ?? "").trim().toLowerCase() !== "bloqueio") continue;
      const blockedStart = parseTimeOnDate(date, entry.hora_inicio ?? entry.start_time);
      const blockedEnd = parseTimeOnDate(date, entry.hora_fim ?? entry.end_time);
      if (blockedStart && blockedEnd && blockedEnd > blockedStart) {
        blocked.push({ start: blockedStart, end: blockedEnd });
      }
    }

    const schedules = await schedulesForWorkerDay(workerId, date);

    for (const schedule of schedules) {
      if (scheduleDayKey(schedule.data_agendamento) !== targetDateKey) continue;
      if (statusCanceled(schedule.status)) continue;

      const blockedStart = parseTimeOnDate(date, schedule.hora_inicio ?? schedule.start_time);
      const blockedEnd = parseTimeOnDate(date, schedule.hora_fim ?? schedule.end_time);
      if (blockedStart && blockedEnd && blockedEnd > blockedStart) {
        blocked.push({ start: blockedStart, end: blockedEnd });
      }
    }

    blocked.sort((a, b) => a.start.getTime() - b.start.getTime());

    const schedule = {
      workStart,
      workEnd,
      breakStart,
      breakEnd,
      blocked,
    };

    dayCacheRef.current.set(key, schedule);
    return schedule;
  }

  async function slotStatesFor(workerId, date, durationMinutes) {
    const normalizedDate = asDateOnly(date);
    const normalizedDuration = durationMinutes > 0 ? durationMinutes : 30;
    const key = `${workerId}|${dateKey(normalizedDate)}|${normalizedDuration}|states`;

    if (slotsCacheRef.current.has(key)) {
      return slotsCacheRef.current.get(key);
    }

    const schedule = await daySchedule(workerId, normalizedDate);
    if (!schedule) {
      slotsCacheRef.current.set(key, []);
      return [];
    }

    const states = [];
    const now = new Date();
    const lastStart = new Date(schedule.workEnd.getTime() - normalizedDuration * 60000);
    let cursor = new Date(schedule.workStart);

    while (cursor <= lastStart) {
      const end = new Date(cursor.getTime() + normalizedDuration * 60000);
      const isPast = cursor < now || end <= now;
      const hitsBreak =
        schedule.breakStart &&
        schedule.breakEnd &&
        overlaps(cursor, end, schedule.breakStart, schedule.breakEnd);
      const isBlocked = schedule.blocked.some((interval) => overlaps(cursor, end, interval.start, interval.end));

      if (!isPast && !hitsBreak) {
        states.push({
          start: new Date(cursor),
          available: !isBlocked,
          occupied: isBlocked,
        });
      }

      cursor = new Date(cursor.getTime() + 30 * 60000);
    }

    slotsCacheRef.current.set(key, states);
    return states;
  }

  async function availableStartsFor(workerId, date, durationMinutes) {
    const states = await slotStatesFor(workerId, date, durationMinutes);
    return states.filter((slot) => slot.available).map((slot) => slot.start);
  }

  async function refreshStarts({ workerId, date, serviceIds, keepSelected = false, preferredStart = null, resetSlotOffset = true }) {
    const requestId = refreshTokenRef.current + 1;
    refreshTokenRef.current = requestId;

    if (!workerId || !date || serviceIds.length === 0) {
      setSlotStates([]);
      setSelectedStart(null);
      if (resetSlotOffset) setSlotOffset(0);
      return [];
    }

    const nextDuration = serviceIds.reduce((sum, id) => sum + serviceDuration(serviceById[id]), 0);
    const nextSlotStates = await slotStatesFor(workerId, date, nextDuration);
    const starts = nextSlotStates.filter((slot) => slot.available).map((slot) => slot.start);

    if (refreshTokenRef.current !== requestId) return starts;

    setSlotStates(nextSlotStates);
    if (resetSlotOffset) setSlotOffset(0);

    if (starts.length === 0) {
      setSelectedStart(null);
      return starts;
    }

    const keepStart = keepSelected && preferredStart && starts.some((slot) => sameMinute(slot, preferredStart));
    const nextStart = keepStart ? preferredStart : starts[0];
    setSelectedStart(nextStart);

    if (!matchesPeriod(nextStart, period)) {
      setPeriod(periodForTime(nextStart));
    }

    return starts;
  }

  useEffect(() => {
    if (!isOpen) return;

    let active = true;

    async function loadData() {
      if (!businessId) {
        setLoading(false);
        setError("businessId ausente na URL.");
        return;
      }

      setLoading(true);
      setSaving(false);
      setAskingCustomer(false);
      setError("");
      setSlotConflict(false);
      setAddServiceOpen(false);
      setServicesExpanded(false);
      setCustomerOpen(false);
      const safeInitialName = String(initialCustomerName ?? "").trim();
      const safeInitialWhatsapp = String(initialCustomerWhatsapp ?? "").trim();
      setLastName(safeInitialName);
      setLastWhatsapp(safeInitialWhatsapp);
      setCustomerName(safeInitialName);
      setCustomerWhatsapp(safeInitialWhatsapp);
      clearAvailabilityCache();

      const nowToday = asDateOnly(new Date());
      setToday(nowToday);

      try {
        const [rawServices, rawWorkers, rawLinks, rawBusiness] = await measureAsync("booking_dialog_bootstrap", () => Promise.all([
          queryRows({
            table: "servicos",
            conditions: [
              { field: "ativo", operator: "eq", value: true },
              { field: "business_id", operator: "eq", value: businessId },
            ],
            orders: [{ field: "nome", ascending: true }],
          }),
          queryRows({
            table: "trabalhadores",
            conditions: [
              { field: "ativo", operator: "eq", value: true },
              { field: "business_id", operator: "eq", value: businessId },
            ],
            orders: [{ field: "nome", ascending: true }],
          }),
          queryRows({
            table: "trabalhador_servico",
            conditions: [{ field: "business_id", operator: "eq", value: businessId }],
          }),
          queryRows({
            table: "business",
            conditions: [{ field: "id", operator: "eq", value: businessId }],
            limit: 1,
          }),
        ]), { businessId });

        if (!active) return;

        if (rawServices.length === 0 || rawWorkers.length === 0) {
          setError("Nao ha servicos ou profissionais disponiveis neste estabelecimento.");
          setLoading(false);
          return;
        }

        const parsedMap = {};
        if (rawLinks.length > 0) {
          for (const link of rawLinks) {
            const workerId = toInt(link.trabalhador_id);
            const serviceId = toInt(link.servico_id);
            if (!workerId || !serviceId) continue;
            if (!parsedMap[workerId]) parsedMap[workerId] = new Set();
            parsedMap[workerId].add(serviceId);
          }
        } else {
          const allServiceIds = rawServices.map((service) => service.id);
          for (const worker of rawWorkers) {
            parsedMap[worker.id] = new Set(allServiceIds);
          }
        }

        const serviceIdsSorted = rawServices
          .map((service) => service.id)
          .filter((id) => Number.isFinite(Number(id)))
          .sort((a, b) => Number(a) - Number(b));

        const preferredServiceId =
          initialServiceId && rawServices.some((service) => service.id === initialServiceId)
            ? initialServiceId
            : serviceIdsSorted[0] ?? rawServices[0].id;

        setServices(rawServices);
        setWorkers(rawWorkers);
        setWorkerServiceMap(parsedMap);
        setBusinessRow(rawBusiness[0] ?? {});
        setSelectedServiceIds([preferredServiceId]);

        const workersForService = rawWorkers.filter((worker) => (parsedMap[worker.id] ?? new Set()).has(preferredServiceId));
        const initialWorkerId = workersForService[0]?.id ?? null;

        if (!initialWorkerId) {
          setError("Nenhum profissional atende esse servico.");
          setSelectedWorkerId(rawWorkers[0]?.id ?? null);
          setSelectedDate(nowToday);
          setSelectedStart(null);
          setSlotStates([]);
          setPeriod("manha");
          setDateOffset(0);
          setSlotOffset(0);
          setLoading(false);
          return;
        }

        setSelectedWorkerId(initialWorkerId);
        setSelectedDate(nowToday);
        setSelectedStart(null);
        setPeriod("manha");
        setDateOffset(0);
        setSlotOffset(0);

        await refreshStarts({
          workerId: initialWorkerId,
          date: nowToday,
          serviceIds: [preferredServiceId],
          keepSelected: false,
        });

        if (!active) return;
        setLoading(false);
      } catch (loadError) {
        if (!active) return;
        setError(`Falha ao carregar agendamento: ${loadError.message}`);
        setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [businessId, initialCustomerName, initialCustomerWhatsapp, initialServiceId, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    if (!posthog) return;

    captureEvent("booking_dialog_opened", analyticsProps());
  }, [isOpen, posthog]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || !selectedWorkerId || loading) return;

    let active = true;
    const dates = Array.from({ length: WINDOW_DAYS }, (_, index) => new Date(today.getTime() + (dateOffset + index) * 86400000));
    const duration = totalDuration > 0 ? totalDuration : 30;
    const timeoutId = window.setTimeout(() => {
      Promise.all(
        dates.map(async (date) => {
          const slots = await availableStartsFor(selectedWorkerId, date, duration);
          return [dateKey(date), slots.length];
        }),
      ).then((entries) => {
        if (!active) return;
        setDateCounts((current) => {
          const next = { ...current };
          for (const [key, count] of entries) {
            next[key] = count;
          }
          return next;
        });
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, selectedWorkerId, dateOffset, today, totalDuration, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || loading || saving || askingCustomer) return;
    if (!selectedWorkerId || !selectedDate || selectedServiceIds.length === 0) return;

    let active = true;
    const refreshIntervalMs = 20000;

    const syncLiveAvailability = async () => {
      dayCacheRef.current.clear();
      slotsCacheRef.current.clear();
      scheduleRowsCacheRef.current.clear();

      const currentStart = selectedStart ? new Date(selectedStart) : null;
      const starts = await refreshStarts({
        workerId: selectedWorkerId,
        date: selectedDate,
        serviceIds: selectedServiceIds,
        keepSelected: true,
        preferredStart: currentStart,
        resetSlotOffset: false,
      });

      if (!active || !currentStart) return;
      if (!starts.some((start) => sameMinute(start, currentStart))) {
        setSlotConflict(true);
      }
    };

    const timer = window.setInterval(syncLiveAvailability, refreshIntervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isOpen, loading, saving, askingCustomer, selectedWorkerId, selectedDate, selectedServiceIds, selectedStart]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectDate(date) {
    if (saving) return;
    setSlotConflict(false);
    setSelectedDate(date);
    setSelectedStart(null);
    setSlotOffset(0);

    await refreshStarts({
      workerId: selectedWorkerId,
      date,
      serviceIds: selectedServiceIds,
      keepSelected: false,
    });
  }

  async function handleSelectWorker(workerId) {
    if (saving) return;

    const supported = workerServiceMap[workerId] ?? new Set();
    const canSupport = selectedServiceIds.every((serviceId) => supported.has(serviceId));
    if (!canSupport) {
      setError("Esse profissional nao atende os servicos selecionados.");
      return;
    }

    setSelectedWorkerId(workerId);
    setSelectedStart(null);
    setSlotOffset(0);
    setError("");
    setSlotConflict(false);

    await refreshStarts({
      workerId,
      date: selectedDate,
      serviceIds: selectedServiceIds,
      keepSelected: false,
    });
  }

  async function fitsCurrentSelection(nextServiceIds) {
    if (!selectedWorkerId || !selectedDate || !selectedStart) return false;

    const duration = nextServiceIds.reduce((sum, serviceId) => sum + serviceDuration(serviceById[serviceId]), 0);
    const starts = await availableStartsFor(selectedWorkerId, selectedDate, duration);
    return starts.some((start) => sameMinute(start, selectedStart));
  }

  async function handleOpenAddService() {
    if (saving) return;
    setSlotConflict(false);
    if (!selectedWorkerId || !selectedDate || !selectedStart) {
      setError("Selecione profissional, data e horario antes de adicionar.");
      return;
    }

    const supported = workerServiceMap[selectedWorkerId] ?? new Set();
    const candidates = services.filter((service) => !selectedServiceIds.includes(service.id) && supported.has(service.id));

    if (candidates.length === 0) {
      setError("Nao ha outro servico compativel para esse profissional.");
      return;
    }

    const fitOptions = [];

    for (const service of candidates) {
      const fits = await fitsCurrentSelection([...selectedServiceIds, service.id]);
      if (fits) fitOptions.push(service);
    }

    if (fitOptions.length === 0) {
      setError("Esse servico nao cabe na agenda do profissional. Escolha outro horario ou servico.");
      return;
    }

    setAddServiceOptions(fitOptions);
    setAddServiceOpen(true);
    setError("");
  }

  async function handleAddService(serviceId) {
    setSlotConflict(false);
    const nextIds = [...selectedServiceIds, serviceId];
    const stillFits = await fitsCurrentSelection(nextIds);
    if (!stillFits) {
      setError("Esse servico nao cabe na agenda do profissional. Escolha outro horario ou servico.");
      setAddServiceOpen(false);
      return;
    }

    clearAvailabilityCache();
    setSelectedServiceIds(nextIds);
    setServicesExpanded(true);
    setAddServiceOpen(false);

    await refreshStarts({
      workerId: selectedWorkerId,
      date: selectedDate,
      serviceIds: nextIds,
      keepSelected: true,
      preferredStart: selectedStart,
    });
  }

  async function handleRemoveExtraService(event) {
    setSlotConflict(false);
    const serviceId = Number(event.currentTarget?.dataset?.serviceId);
    if (!serviceId) return;
    if (selectedServiceIds.length <= 1 || selectedServiceIds[0] === serviceId) return;
    const nextIds = selectedServiceIds.filter((id) => id !== serviceId);
    clearAvailabilityCache();
    setSelectedServiceIds(nextIds);
    if (nextIds.length <= 1) {
      setServicesExpanded(false);
    }

    await refreshStarts({
      workerId: selectedWorkerId,
      date: selectedDate,
      serviceIds: nextIds,
      keepSelected: true,
      preferredStart: selectedStart,
    });
  }

  function handleStartBooking() {
    if (saving || askingCustomer) return;
    setSlotConflict(false);
    if (!selectedWorkerId || !selectedDate || !selectedStart || selectedServiceIds.length === 0) {
      setError("Selecione os dados do agendamento primeiro.");
      return;
    }

    setCustomerName(lastName);
    setCustomerWhatsapp(lastWhatsapp);
    setCustomerOpen(true);
    captureEvent("booking_customer_prompt_opened", analyticsProps());
  }

  async function handleCreateBooking() {
    if (saving) return;
    setSlotConflict(false);

    const cleanName = customerName.trim();
    const cleanPhoneDigits = normalizePhoneDigits(customerWhatsapp);

    if (!cleanName) {
      setError("Informe seu nome para confirmar o agendamento.");
      return;
    }

    if (cleanPhoneDigits.length < 12) {
      setError("Informe um WhatsApp valido no formato brasileiro.");
      return;
    }

    setCustomerOpen(false);
    setAskingCustomer(true);
    setSaving(true);
    setError("");
    captureEvent("booking_submit_attempted", analyticsProps());

    const totalStartedAt = performance.now();

    try {
      const currentStart = selectedStart ? new Date(selectedStart) : null;
      if (!currentStart || !selectedWorkerId || !selectedDate) {
        setError("Horario indisponivel. Escolha novamente antes de confirmar.");
        return;
      }

      clearAvailabilityCache();
      const latestStarts = await measureAsync(
        "booking_validate_latest_starts",
        () => availableStartsFor(selectedWorkerId, selectedDate, totalDuration > 0 ? totalDuration : 30),
        { businessId, workerId: selectedWorkerId, selectedServiceCount: selectedServiceIds.length },
      );
      if (!latestStarts.some((start) => sameMinute(start, currentStart))) {
        await refreshStarts({
          workerId: selectedWorkerId,
          date: selectedDate,
          serviceIds: selectedServiceIds,
          keepSelected: false,
        });
        setError("Outra pessoa acabou de reservar esse horario. Escolha um novo horario para continuar.");
        setSlotConflict(true);
        captureEvent("booking_slot_conflict", analyticsProps({ reason: "latest_start_unavailable" }));
        return;
      }

      const worker = workers.find((entry) => entry.id === selectedWorkerId);
      const workerName = worker?.nome ?? "Profissional";
      const reminderCount = reminderCountForBusinessRow(businessRow);
      const blockN8n = shouldBlockN8nForBusinessRow(businessRow);

      const selectedDateKey = dateKey(selectedDate);
      const scheduleRequests = [];
      let cursor = new Date(selectedStart);

      for (const serviceId of selectedServiceIds) {
        const service = serviceById[serviceId];
        if (!service) continue;

        const end = new Date(cursor.getTime() + serviceDuration(service) * 60000);
        scheduleRequests.push({
          serviceId,
          startTime: timeLabel(cursor),
          endTime: timeLabel(end),
        });
        cursor = end;
      }

      let createdIds = [];
      let confirmationPayload = null;
      let asyncSideEffects = [];

      if (isBookingApiEnabled()) {
        const apiResult = await measureAsync("booking_create_via_api", () => createBookingViaApi({
          businessId,
          workerId: selectedWorkerId,
          customerName: cleanName,
          customerPhone: cleanPhoneDigits,
          dateKey: selectedDateKey,
          schedules: scheduleRequests,
        }), {
          businessId,
          workerId: selectedWorkerId,
          selectedServiceCount: selectedServiceIds.length,
          dateKey: selectedDateKey,
        });

        createdIds = Array.isArray(apiResult?.createdIds)
          ? apiResult.createdIds.map((item) => toInt(item)).filter(Boolean)
          : [];
        confirmationPayload = apiResult?.confirmationPayload ?? null;
      } else {
        const limitCheck = await measureAsync("booking_check_limit", () => checkScheduleCreationLimit({
          businessId,
          additionalSchedules: selectedServiceIds.length,
          workerId: selectedWorkerId,
          referenceDate: selectedDate,
          businessRow,
        }), { businessId, workerId: selectedWorkerId, selectedServiceCount: selectedServiceIds.length });

        if (limitCheck.allowed !== true) {
          setError(limitCheck.message ?? "Limite do plano atingido para novos agendamentos.");
          captureEvent("booking_submit_failed", analyticsProps({ reason: "plan_limit", error_code: "booking/plan-limit" }));
          return;
        }

        const insertedSchedules = await measureAsync("booking_create_schedules", () => createSchedulesAtomically({
          businessId,
          workerId: selectedWorkerId,
          customerName: cleanName,
          customerPhone: cleanPhoneDigits,
          dateKey: selectedDateKey,
          reminderCount,
          status: "confirmado",
          schedules: scheduleRequests,
        }), {
          businessId,
          workerId: selectedWorkerId,
          selectedServiceCount: selectedServiceIds.length,
          dateKey: selectedDateKey,
        });

        createdIds = [];
        asyncSideEffects = [];
        for (const inserted of insertedSchedules) {
          const insertedId = toInt(inserted?.id);
          if (insertedId) {
            createdIds.push(insertedId);
          }

          const serviceId = toInt(inserted?.servico_id);
          const service = serviceById[serviceId];
          const scheduleStart = String(inserted?.hora_inicio ?? "").trim();

          asyncSideEffects.push(
            insertRow({
              table: "notifications",
              data: {
                business_id: businessId,
                title: `Voce tem um servico de ${service?.nome ?? "servico"} para ${selectedDateKey}, as ${scheduleStart || "--:--"}!`,
                message: `O cliente ${cleanName} acabou de agendar um servico. Telefone de contato: ${cleanPhoneDigits}.`,
                trabalhador_nome: workerName,
                type: "agendamento",
              },
            }).catch(() => null),
          );

          if (!blockN8n) {
            asyncSideEffects.push(
              fetch("https://n8n.tock.app.br/webhook/gatilho-agendamento-new", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  agendamento: toJsonSafe(inserted),
                  business: toJsonSafe(businessRow),
                }),
              }).catch(() => null),
            );
          }
        }

        confirmationPayload = {
          schedule: insertedSchedules[0],
          business: businessRow,
          worker: worker ?? {},
          service: selectedServices[0] ?? serviceById[toInt(insertedSchedules[0]?.servico_id)] ?? {},
          totalPrice,
        };
      }

      if (createdIds.length === 0) {
        setError("Nao foi possivel criar o agendamento.");
        captureEvent("booking_submit_failed", analyticsProps({ reason: "empty_created_ids" }));
        return;
      }

      setLastName(cleanName);
      setLastWhatsapp(customerWhatsapp.trim());
      setSlotConflict(false);
      captureEvent("booking_submit_succeeded", analyticsProps({ agendamento_id: createdIds[0] }));
      onSuccess?.(createdIds[0], confirmationPayload);
      onClose?.("success");
      Promise.allSettled(asyncSideEffects).catch(() => {});
      queuePerfEvent({
        name: "booking_submit_total",
        durationMs: performance.now() - totalStartedAt,
        context: {
          businessId,
          workerId: selectedWorkerId,
          selectedServiceCount: selectedServiceIds.length,
          dateKey: selectedDateKey,
        },
      });
    } catch (submitError) {
      queuePerfEvent({
        name: "booking_submit_total",
        durationMs: performance.now() - totalStartedAt,
        context: {
          businessId,
          workerId: selectedWorkerId,
          selectedServiceCount: selectedServiceIds.length,
          dateKey: selectedDate ? dateKey(selectedDate) : "",
        },
        error: submitError,
        force: true,
      });
      if (isBookingSlotTakenError(submitError) || isBookingSlotUnavailableError(submitError)) {
        clearAvailabilityCache();
        await refreshStarts({
          workerId: selectedWorkerId,
          date: selectedDate,
          serviceIds: selectedServiceIds,
          keepSelected: false,
        });
        const message = isBookingSlotTakenError(submitError)
          ? "Esse horario acabou de ser preenchido por outra pessoa. Selecione outro horario."
          : submitError.message || "Esse horario nao cabe mais na disponibilidade atual do profissional.";
        setError(message);
        setSlotConflict(true);
        captureEvent("booking_slot_conflict", analyticsProps({
          reason: isBookingSlotTakenError(submitError) ? "slot_taken" : "slot_unavailable",
          error_code: String(submitError?.code ?? ""),
        }));
        return;
      }
      setError(`Erro ao agendar: ${submitError.message}`);
      setSlotConflict(false);
      captureEvent("booking_submit_failed", analyticsProps({
        error_code: String(submitError?.code ?? ""),
        error_message: String(submitError?.message ?? "").slice(0, 160),
      }));
    } finally {
      setAskingCustomer(false);
      setSaving(false);
    }
  }

  const maxDateOffset = Math.floor(SEARCH_HORIZON_DAYS / WINDOW_DAYS) * WINDOW_DAYS;
  const canPrevDays = dateOffset > 0;
  const canNextDays = dateOffset < maxDateOffset;
  const datesWindow = Array.from({ length: WINDOW_DAYS }, (_, index) => new Date(today.getTime() + (dateOffset + index) * 86400000));

  const maxSlotOffset = Math.max(0, Math.floor(Math.max(0, slotsByPeriod.length - 1) / SLOTS_PER_PAGE) * SLOTS_PER_PAGE);
  const canPrevSlots = slotOffset > 0;
  const canNextSlots = slotOffset < maxSlotOffset;

  const workerRow = workers.find((worker) => worker.id === selectedWorkerId) ?? null;
  const workerName = workerRow?.nome ?? "Profissional";
  const workerAvatar = workerPhoto(workerRow);
  const businessLogo = useMemo(
    () =>
      firstText([
        businessRow?.logo_url,
        businessRow?.logo,
        businessRow?.foto_url,
        businessRow?.photo_url,
        businessRow?.cover_photo_url,
      ]) ?? "",
    [businessRow],
  );

  const canSchedule =
    !loading &&
    !saving &&
    !askingCustomer &&
    selectedWorkerId != null &&
    selectedDate != null &&
    selectedStart != null &&
    selectedServiceIds.length > 0;

  const confirmationDateLabel = selectedDate
    ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(selectedDate)
    : "Data indisponivel";
  const confirmationStart = timelineRows[0]?.start ?? selectedStart;
  const confirmationEnd = timelineRows[timelineRows.length - 1]?.end ?? null;
  const confirmationTimeLabel = `de ${confirmationStart ? timeLabel(confirmationStart) : "--:--"} as ${confirmationEnd ? timeLabel(confirmationEnd) : "--:--"}`;

  return (
    <>
      <Modal isOpen={isOpen} onClose={() => !saving && !askingCustomer && onClose?.("dismiss")} maxWidth={860}>
        <div className="booking-dialog-modern">
          <header className="booking-modern-head">
            <div className="booking-head-left" aria-hidden="true">
              {businessLogo ? (
                <div className="booking-business-logo">
                  <img src={businessLogo} alt="Logo do estabelecimento" loading="lazy" />
                </div>
              ) : (
                <span className="booking-head-spacer" />
              )}
            </div>
            <h3>{monthLabel(selectedDate ?? today)}</h3>
            <div className="booking-head-right">
              <button
                className="booking-icon-circle"
                onClick={() => !saving && !askingCustomer && onClose?.("dismiss")}
                disabled={saving || askingCustomer}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          {loading ? (
            <div className="booking-modern-loading">
              <Loader2 size={22} className="spin" /> Carregando disponibilidade...
            </div>
          ) : (
            <>
              <div className="booking-modern-scroll">
                <section className="booking-date-carousel">
                  <button
                    className="booking-icon-circle"
                    onClick={() => setDateOffset((current) => Math.max(0, current - WINDOW_DAYS))}
                    disabled={!canPrevDays}
                    type="button"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <div className="booking-date-list" role="list">
                    {datesWindow.map((date) => {
                      const key = dateKey(date);
                      const selected = isSameDay(selectedDate, date);
                      const count = dateCounts[key] ?? 0;
                      const indicatorClass = count >= 6 ? "green" : count > 0 ? "yellow" : "none";

                      return (
                        <button
                          key={key}
                          className={selected ? "booking-date-card active" : "booking-date-card"}
                          onClick={() => handleSelectDate(date)}
                          type="button"
                        >
                          <span className="weekday">{weekDayLabel(date)}</span>
                          <strong>{date.getDate()}</strong>
                          <span className={`slots-indicator ${indicatorClass}`} />
                        </button>
                      );
                    })}
                  </div>

                  <button
                    className="booking-icon-circle"
                    onClick={() => setDateOffset((current) => Math.min(maxDateOffset, current + WINDOW_DAYS))}
                    disabled={!canNextDays}
                    type="button"
                  >
                    <ChevronRight size={20} />
                  </button>
                </section>

                <section className="booking-period-tabs">
                  {[
                    { id: "manha", label: "Manha" },
                    { id: "tarde", label: "Tarde" },
                    { id: "noite", label: "Noite" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      className={period === item.id ? "period-tab active" : "period-tab"}
                      onClick={() => {
                        setPeriod(item.id);
                        setSlotOffset(0);
                      }}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </section>

                <section className="booking-slots-row">
                  {slotsByPeriod.length === 0 ? (
                    <div className="booking-empty-slots">Nao ha horarios disponiveis nesse periodo.</div>
                  ) : (
                    <>
                      <button
                        className="booking-icon-circle"
                        onClick={() => setSlotOffset((current) => Math.max(0, current - SLOTS_PER_PAGE))}
                        disabled={!canPrevSlots}
                        type="button"
                      >
                        <ChevronLeft size={20} />
                      </button>

                      <div className="booking-slot-list">
                        {visibleSlots.map((slot) => (
                          <button
                            key={slot.start.toISOString()}
                            className={[
                              "booking-slot-btn",
                              selectedStart && sameMinute(slot.start, selectedStart) ? "active" : "",
                              !slot.available ? "occupied" : "",
                            ].filter(Boolean).join(" ")}
                            onClick={() => {
                              if (!slot.available) return;
                              setSlotConflict(false);
                              setSelectedStart(slot.start);
                              captureEvent("booking_slot_selected", analyticsProps({
                                selected_date: selectedDate ? dateKey(selectedDate) : undefined,
                                selected_start: timeLabel(slot.start),
                              }));
                            }}
                            disabled={!slot.available}
                            type="button"
                          >
                            <span>{timeLabel(slot.start)}</span>
                            {!slot.available ? <small>Ocupado</small> : null}
                          </button>
                        ))}
                      </div>

                      <button
                        className="booking-icon-circle"
                        onClick={() => setSlotOffset((current) => Math.min(maxSlotOffset, current + SLOTS_PER_PAGE))}
                        disabled={!canNextSlots}
                        type="button"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </>
                  )}
                </section>

                <button
                  className="booking-add-service"
                  type="button"
                  onClick={() => {
                    captureEvent("booking_add_service_opened", analyticsProps());
                    handleOpenAddService();
                  }}
                  disabled={saving}
                >
                  <Plus size={18} /> Adicionar outro servico
                </button>

                <section className="booking-selected-services">
                  <div className="booking-selected-head">
                    <h4>Servicos selecionados</h4>
                    {selectedServiceIds.length > 1 ? (
                      <button
                        type="button"
                        className="booking-selected-toggle"
                        onClick={() => setServicesExpanded((current) => !current)}
                      >
                        {servicesExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                      </button>
                    ) : null}
                  </div>
                  <div className="booking-selected-chip-row">
                    {selectedServiceIds.map((serviceId, index) => {
                      const service = serviceById[serviceId];
                      if (!service) return null;
                      return (
                        <div key={`chip-${serviceId}`} className={index === 0 ? "booking-service-chip main" : "booking-service-chip"}>
                          <span>{service.nome ?? "Servico"}</span>
                          <small>{durationLabel(serviceDuration(service))}</small>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="booking-summary-card">
                  {timelineRows.length === 0 ? (
                    <p className="muted">Selecione um horario para ver o resumo do servico.</p>
                  ) : selectedServiceIds.length > 1 && !servicesExpanded ? (
                    <p className="muted booking-combo-hint">
                      Combo com {selectedServiceIds.length} servicos. Use "Ver detalhes" para visualizar horario e remover extras.
                    </p>
                  ) : (
                    timelineRows.map((entry) => {
                      const service = serviceById[entry.serviceId];
                      if (!service) return null;

                      return (
                        <div key={`${entry.serviceId}-${entry.start.toISOString()}`} className="booking-summary-line">
                          <div>
                            <strong>{service.nome ?? "Servico"}</strong>
                            <small>{`${timeLabel(entry.start)} - ${timeLabel(entry.end)}`}</small>
                          </div>
                          <div className="booking-summary-price">
                            <span>{formatMoney(service.preco)}</span>
                            {selectedServiceIds.length > 1 && selectedServiceIds[0] !== entry.serviceId ? (
                              <button
                                className="booking-icon-circle small"
                                type="button"
                                disabled={saving}
                                data-service-id={entry.serviceId}
                                onClick={handleRemoveExtraService}
                              >
                                <X size={15} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div className="booking-summary-worker">
                    {workerAvatar ? <img src={workerAvatar} alt={workerName} /> : <UserRound size={16} />}
                    <p>
                      <span>Profissional:</span> {workerName}
                    </p>
                  </div>
                </section>

                <section className="booking-worker-list">
                  <h4>Profissional</h4>
                  <div className="worker-chip-wrap">
                    {workerIdsSorted.map((workerId) => {
                      const worker = workers.find((entry) => entry.id === workerId);
                      const supported = workerServiceMap[workerId] ?? new Set();
                      const enabled = selectedServiceIds.every((serviceId) => supported.has(serviceId));
                      const selected = workerId === selectedWorkerId;
                      const name = worker?.nome ?? "Profissional";
                      const avatar = workerPhoto(worker);

                      return (
                        <button
                          key={workerId}
                          className={selected ? "worker-chip active" : "worker-chip"}
                          onClick={() => enabled && handleSelectWorker(workerId)}
                          disabled={!enabled}
                          type="button"
                        >
                          {avatar ? <img src={avatar} alt={name} /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>

              {error ? <p className="error-text booking-inline-error">{error}</p> : null}
              {slotConflict ? (
                <button className="ghost-btn booking-conflict-back" type="button" onClick={() => onClose?.("slot-taken")}>
                  Voltar para servicos
                </button>
              ) : null}

              <footer className="booking-modern-foot">
                <div>
                  <p className="booking-total-label">Total:</p>
                  <strong>{formatMoney(totalPrice)}</strong>
                  <small>{durationLabel(totalDuration)}</small>
                </div>

                <button className="cta-btn booking-main-action" onClick={handleStartBooking} disabled={!canSchedule} type="button">
                  {saving ? (
                    <>
                      <Loader2 size={16} className="spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      <CalendarDays size={17} /> Agendar
                    </>
                  )}
                </button>
              </footer>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={addServiceOpen} onClose={() => setAddServiceOpen(false)} maxWidth={500}>
        <div className="booking-picker-dialog">
          <div className="dialog-head">
            <h3>Adicionar outro servico</h3>
            <button className="ghost-btn" onClick={() => setAddServiceOpen(false)} type="button">
              Fechar
            </button>
          </div>

          <div className="booking-picker-list">
            {addServiceOptions.map((service) => (
              <button key={service.id} className="booking-picker-item" type="button" onClick={() => handleAddService(service.id)}>
                <div>
                  <strong>{service.nome ?? "Servico"}</strong>
                  <small>{serviceDuration(service)} min</small>
                </div>
                <span>{formatMoney(service.preco)}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal isOpen={customerOpen} onClose={() => !saving && setCustomerOpen(false)} maxWidth={460}>
        <div className="booking-customer-dialog">
          <div className="booking-customer-head">
            <h3>Confirmacao</h3>
            <div className="booking-customer-chips">
              <span className="booking-customer-chip">{confirmationDateLabel}</span>
              <span className="booking-customer-chip">{confirmationTimeLabel}</span>
            </div>
          </div>

          <label htmlFor="booking-customer-name">Nome</label>
          <input
            id="booking-customer-name"
            className="ph-no-capture"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Seu nome completo"
          />

          <label htmlFor="booking-customer-phone">Whatsapp</label>
          <input
            id="booking-customer-phone"
            className="ph-no-capture"
            value={customerWhatsapp}
            onChange={(event) => setCustomerWhatsapp(event.target.value)}
            placeholder="+55 (00) 0 0000-0000"
          />

          <div className="booking-customer-actions">
            <button className="ghost-btn" type="button" onClick={() => setCustomerOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="cta-btn" type="button" onClick={handleCreateBooking} disabled={saving}>
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
