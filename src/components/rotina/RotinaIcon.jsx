import {
  Activity,
  Apple,
  BedDouble,
  BookOpen,
  Brain,
  CircleCheck,
  Coffee,
  Droplet,
  Dumbbell,
  Footprints,
  HeartPulse,
  Hourglass,
  Moon,
  PersonStanding,
  PhoneOff,
  Pill,
  Salad,
  Scissors,
  Smile,
  SmilePlus,
  Sparkles,
  Stethoscope,
  Wind,
} from "lucide-react";

const HABIT_ICONS = {
  droplet: Droplet,
  dumbbell: Dumbbell,
  footprints: Footprints,
  stretch: PersonStanding,
  moon: Moon,
  "phone-off": PhoneOff,
  apple: Apple,
  wind: Wind,
  smile: Smile,
  sparkles: Sparkles,
  tooth: SmilePlus,
  pill: Pill,
  book: BookOpen,
  coffee: Coffee,
  check: CircleCheck,
};

const DIMENSION_ICONS = {
  movimento: Activity,
  saude: Stethoscope,
  mente: Brain,
  sono: BedDouble,
  alimentacao: Salad,
  aparencia: Scissors,
  tempo: Hourglass,
};

export function HabitIcon({ name, size = 18 }) {
  const Icon = HABIT_ICONS[name] ?? CircleCheck;
  return <Icon size={size} aria-hidden="true" />;
}

export function DimensionIcon({ id, size = 18 }) {
  const Icon = DIMENSION_ICONS[id] ?? HeartPulse;
  return <Icon size={size} aria-hidden="true" />;
}
