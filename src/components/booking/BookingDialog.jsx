import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import Modal from "../common/Modal";
import {
  checkScheduleCreationLimit,
  insertRow,
  queryRows,
  reminderCountForBusinessRow,
  shouldBlockN8nForBusinessRow,
  toJsonSafe,
} from "../../lib/firestore";
import {
  asDateOnly,
  formatMoney,
  overlaps,
  parseDate,
  parseTimeOnDate,
  sameMinute,
  toInt,
  toNumber,
} from "../../lib/marketplace";

const SEARCH_DAYS = 60;

function durationFor(service) {
  const value = toInt(service?.duracao_minutos);
  return value && value > 0 ? value : 30;
}

function timeLabel(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function statusCanceled(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "cancelado" || normalized === "canceled" || normalized === "cancelled";
}

function normalizePhoneDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export default function BookingDialog({ isOpen, businessId, initialServiceId = null, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workerServiceMap, setWorkerServiceMap] = useState({});
  const [businessRow, setBusinessRow] = useState({});

  const today = useMemo(() => asDateOnly(new Date()), []);
  const maxBookDate = useMemo(() => new Date(today.getTime() + SEARCH_DAYS * 86400000), [today]);
  const minDateStr = useMemo(
    () => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    [today],
  );
  const maxDateStr = useMemo(
    () =>
      `${maxBookDate.getFullYear()}-${String(maxBookDate.getMonth() + 1).padStart(2, "0")}-${String(maxBookDate.getDate()).padStart(2, "0")}`,
    [maxBookDate],
  );

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedStart, setSelectedStart] = useState(null);
  const [starts, setStarts] = useState([]);

  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");

  const serviceById = useMemo(() => {
    const map = {};
    for (const service of services) {
      map[service.id] = service;
    }
    return map;
  }, [services]);

  const selectedServices = selectedServiceIds.map((id) => serviceById[id]).filter(Boolean);

  const totalDuration = useMemo(
    () => selectedServices.reduce((sum, service) => sum + durationFor(service), 0),
    [selectedServices],
  );

  const totalPrice = useMemo(
    () => selectedServices.reduce((sum, service) => sum + toNumber(service.preco), 0),
    [selectedServices],
  );

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [rawServices, rawWorkers, rawLinks, rawBusiness] = await Promise.all([
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
        ]);

        if (!mounted) return;

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

        setServices(rawServices);
        setWorkers(rawWorkers);
        setWorkerServiceMap(parsedMap);
        setBusinessRow(rawBusiness[0] ?? {});

        const preferred = initialServiceId && rawServices.some((service) => service.id === initialServiceId)
          ? initialServiceId
          : rawServices[0].id;

        setSelectedServiceIds([preferred]);

        const supportingWorker = rawWorkers.find((worker) => parsedMap[worker.id]?.has(preferred));
        setSelectedWorkerId(supportingWorker?.id ?? rawWorkers[0]?.id ?? null);

        setSelectedDate(today);
        setSelectedStart(null);
        setCustomerName("");
        setCustomerWhatsapp("");
        setLoading(false);
      } catch (loadError) {
        if (!mounted) return;
        setError(`Falha ao carregar agendamento: ${loadError.message}`);
        setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [businessId, initialServiceId, isOpen, today]);

  const workerOptions = useMemo(() => {
    if (selectedServiceIds.length === 0) return workers;
    return workers.filter((worker) => {
      const supported = workerServiceMap[worker.id] ?? new Set();
      return selectedServiceIds.every((serviceId) => supported.has(serviceId));
    });
  }, [selectedServiceIds, workerServiceMap, workers]);

  const activeWorkerId = useMemo(() => {
    if (selectedWorkerId && workerOptions.some((worker) => worker.id === selectedWorkerId)) {
      return selectedWorkerId;
    }
    return workerOptions[0]?.id ?? null;
  }, [selectedWorkerId, workerOptions]);

  useEffect(() => {
    if (!isOpen || !activeWorkerId || !selectedDate || totalDuration <= 0) return;

    let active = true;

    async function loadStarts() {
      const slots = await availableStartsFor({
        businessId,
        workerId: activeWorkerId,
        date: selectedDate,
        durationMinutes: totalDuration,
      });
      if (!active) return;
      setStarts(slots);
      if (selectedStart && !slots.some((slot) => sameMinute(slot, selectedStart))) {
        setSelectedStart(slots[0] ?? null);
      }
      if (!selectedStart && slots.length > 0) {
        setSelectedStart(slots[0]);
      }
    }

    loadStarts();

    return () => {
      active = false;
    };
  }, [activeWorkerId, businessId, selectedDate, selectedStart, totalDuration, isOpen]);

  const addableServices = useMemo(() => {
    if (!activeWorkerId) return [];
    const supported = workerServiceMap[activeWorkerId] ?? new Set();
    return services.filter((service) => !selectedServiceIds.includes(service.id) && supported.has(service.id));
  }, [selectedServiceIds, activeWorkerId, services, workerServiceMap]);

  async function fitsCurrentSelection(nextServiceIds) {
    if (!activeWorkerId || !selectedDate || !selectedStart) return false;
    const duration = nextServiceIds.reduce((sum, id) => sum + durationFor(serviceById[id]), 0);
    const nextStarts = await availableStartsFor({
      businessId,
      workerId: activeWorkerId,
      date: selectedDate,
      durationMinutes: duration,
    });
    return nextStarts.some((slot) => sameMinute(slot, selectedStart));
  }

  async function handleAddService(serviceId) {
    const nextIds = [...selectedServiceIds, serviceId];
    const fits = await fitsCurrentSelection(nextIds);
    if (!fits) {
      setError("Esse servico nao cabe no horario selecionado para este profissional.");
      return;
    }
    setSelectedServiceIds(nextIds);
    setError("");
  }

  function removeService(serviceId) {
    if (selectedServiceIds[0] === serviceId) return;
    setSelectedServiceIds((current) => current.filter((id) => id !== serviceId));
  }

  async function handleSubmit() {
    if (saving) return;
    if (!activeWorkerId || !selectedDate || !selectedStart || selectedServiceIds.length === 0) {
      setError("Selecione profissional, servicos e horario.");
      return;
    }

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

    setSaving(true);
    setError("");

    try {
      const limitCheck = await checkScheduleCreationLimit({
        businessId,
        additionalSchedules: selectedServiceIds.length,
        workerId: activeWorkerId,
        referenceDate: selectedDate,
        businessRow,
      });

      if (limitCheck.allowed !== true) {
        setError(limitCheck.message ?? "Limite do plano atingido para novos agendamentos.");
        setSaving(false);
        return;
      }

      const worker = workers.find((entry) => entry.id === activeWorkerId);
      const workerName = worker?.nome ?? "Profissional";
      const reminderCount = reminderCountForBusinessRow(businessRow);
      const blockN8n = shouldBlockN8nForBusinessRow(businessRow);

      let cursor = new Date(selectedStart);
      const createdIds = [];

      for (const serviceId of selectedServiceIds) {
        const service = serviceById[serviceId];
        const end = new Date(cursor.getTime() + durationFor(service) * 60000);
        const dateISO = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

        const inserted = await insertRow({
          table: "agendamentos",
          data: {
            business_id: businessId,
            trabalhador_id: activeWorkerId,
            servico_id: serviceId,
            cliente_nome: cleanName,
            cliente_telefone: cleanPhoneDigits,
            data_agendamento: dateISO,
            hora_inicio: timeLabel(cursor),
            hora_fim: timeLabel(end),
            status: "confirmado",
            lembrete_count: reminderCount,
          },
        });

        if (inserted?.id) {
          createdIds.push(inserted.id);
          await insertRow({
            table: "notifications",
            data: {
              business_id: businessId,
              title: `Voce tem um servico de ${service?.nome ?? "servico"} para ${dateISO}, as ${timeLabel(cursor)}!`,
              message: `O cliente ${cleanName} acabou de agendar um servico. Telefone de contato: ${cleanPhoneDigits}.`,
              trabalhador_nome: workerName,
              type: "agendamento",
            },
          });

          if (!blockN8n) {
            fetch("https://n8n.tock.app.br/webhook/gatilho-agendamento-new", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agendamento: toJsonSafe(inserted),
                business: toJsonSafe(businessRow),
              }),
            }).catch(() => {});
          }
        }

        cursor = end;
      }

      if (createdIds.length === 0) {
        setError("Nao foi possivel criar o agendamento.");
        setSaving(false);
        return;
      }

      onSuccess?.(createdIds[0]);
      onClose?.();
    } catch (submitError) {
      setError(`Erro ao agendar: ${submitError.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => !saving && onClose?.()} maxWidth={860}>
      <div className="booking-dialog">
        <div className="dialog-head">
          <h3>Novo agendamento</h3>
          <button className="ghost-btn" onClick={onClose} disabled={saving}>Fechar</button>
        </div>

        {loading ? (
          <div className="dialog-loading"><Loader2 size={22} className="spin" /> Carregando disponibilidade...</div>
        ) : (
          <>
            <div className="booking-grid">
              <section>
                <label>Servico principal</label>
                <select
                  value={selectedServiceIds[0] ?? ""}
                  onChange={(event) => setSelectedServiceIds([Number(event.target.value)])}
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.nome} - {formatMoney(service.preco)}
                    </option>
                  ))}
                </select>

                {selectedServiceIds.length > 1 ? (
                  <div className="extras-list">
                    {selectedServiceIds.slice(1).map((id) => {
                      const service = serviceById[id];
                      if (!service) return null;
                      return (
                        <div key={id} className="extra-item">
                          <span>{service.nome}</span>
                          <button className="icon-btn" onClick={() => removeService(id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="add-service-row">
                  <select defaultValue="" onChange={(event) => event.target.value && handleAddService(Number(event.target.value))}>
                    <option value="">Adicionar outro servico compativel</option>
                    {addableServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.nome} - {durationFor(service)} min
                      </option>
                    ))}
                  </select>
                  <button className="icon-btn" disabled>
                    <Plus size={15} />
                  </button>
                </div>

                <label>Profissional</label>
                <select value={activeWorkerId ?? ""} onChange={(event) => setSelectedWorkerId(Number(event.target.value))}>
                  {workerOptions.map((worker) => (
                    <option key={worker.id} value={worker.id}>{worker.nome}</option>
                  ))}
                </select>
              </section>

              <section>
                <label>Data</label>
                <input
                  type="date"
                  value={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`}
                  min={minDateStr}
                  max={maxDateStr}
                  onChange={(event) => {
                    const date = parseDate(event.target.value);
                    if (date) {
                      setSelectedDate(asDateOnly(date));
                      setSelectedStart(null);
                    }
                  }}
                />

                <label>Horarios disponiveis</label>
                <div className="slots-grid">
                  {starts.length === 0 ? (
                    <p className="muted">Sem horarios para esta data.</p>
                  ) : (
                    starts.map((slot) => (
                      <button
                        key={slot.toISOString()}
                        className={selectedStart && sameMinute(slot, selectedStart) ? "slot-btn active" : "slot-btn"}
                        onClick={() => setSelectedStart(slot)}
                        type="button"
                      >
                        {timeLabel(slot)}
                      </button>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="booking-customer">
              <label>Nome completo</label>
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Seu nome" />
              <label>WhatsApp</label>
              <input value={customerWhatsapp} onChange={(event) => setCustomerWhatsapp(event.target.value)} placeholder="+55 (00) 0 0000-0000" />
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <div className="dialog-foot">
              <div>
                <strong>{formatMoney(totalPrice)}</strong>
                <p>{totalDuration} min totais</p>
              </div>
              <button className="cta-btn" onClick={handleSubmit} disabled={saving || !selectedStart}>
                {saving ? <><Loader2 size={16} className="spin" /> Salvando...</> : "Confirmar agendamento"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

async function availableStartsFor({ businessId, workerId, date, durationMinutes }) {
  const day = asDateOnly(date);
  const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const weekDay = day.getDay();

  const [workRows, exceptionRows, schedules] = await Promise.all([
    queryRows({
      table: "horarios_padrao",
      conditions: [
        { field: "trabalhador_id", operator: "eq", value: workerId },
        { field: "dia_semana", operator: "eq", value: weekDay },
      ],
    }),
    queryRows({
      table: "horarios_excecoes",
      conditions: [
        { field: "trabalhador_id", operator: "eq", value: workerId },
        { field: "data", operator: "eq", value: dateKey },
      ],
    }),
    queryRows({
      table: "agendamentos",
      conditions: [
        { field: "business_id", operator: "eq", value: businessId },
        { field: "trabalhador_id", operator: "eq", value: workerId },
        { field: "data_agendamento", operator: "eq", value: dateKey },
      ],
    }),
  ]);

  const activeWork = workRows.find((row) => row.ativo !== false);
  if (!activeWork) return [];

  const workStart = parseTimeOnDate(day, activeWork.hora_inicio ?? activeWork.start_time ?? activeWork.start);
  const workEnd = parseTimeOnDate(day, activeWork.hora_fim ?? activeWork.end_time ?? activeWork.end);
  if (!workStart || !workEnd || workEnd <= workStart) return [];

  const pauseStart = parseTimeOnDate(day, activeWork.hora_pausa_inicio ?? activeWork.break_start ?? activeWork.lunch_start);
  const pauseEnd = parseTimeOnDate(day, activeWork.hora_pausa_fim ?? activeWork.break_end ?? activeWork.lunch_end);

  const blocked = [];

  for (const item of exceptionRows) {
    const blockedStart = parseTimeOnDate(day, item.hora_inicio ?? item.start_time);
    const blockedEnd = parseTimeOnDate(day, item.hora_fim ?? item.end_time);
    if (blockedStart && blockedEnd && blockedEnd > blockedStart) {
      blocked.push({ start: blockedStart, end: blockedEnd });
    }
  }

  for (const schedule of schedules) {
    if (statusCanceled(schedule.status)) continue;
    const blockedStart = parseTimeOnDate(day, schedule.hora_inicio);
    const blockedEnd = parseTimeOnDate(day, schedule.hora_fim);
    if (blockedStart && blockedEnd && blockedEnd > blockedStart) {
      blocked.push({ start: blockedStart, end: blockedEnd });
    }
  }

  const starts = [];
  const now = new Date();
  const slotDuration = Math.max(30, durationMinutes || 30);
  let cursor = new Date(workStart);
  const lastStart = new Date(workEnd.getTime() - slotDuration * 60000);

  while (cursor <= lastStart) {
    const end = new Date(cursor.getTime() + slotDuration * 60000);

    const isPast = cursor < now || end < now;
    const breaksShift = pauseStart && pauseEnd && overlaps(cursor, end, pauseStart, pauseEnd);
    const collides = blocked.some((item) => overlaps(cursor, end, item.start, item.end));

    if (!isPast && !breaksShift && !collides) {
      starts.push(new Date(cursor));
    }

    cursor = new Date(cursor.getTime() + 30 * 60000);
  }

  return starts;
}
