import type { WowClass } from "../../shared/classes";

// NeedToKnow timer presets, one per class. Every class gets the same groups at the same spots;
// only the bars differ. Aura names must match the Russian Forever client; a wrong name is harmless
// (the bar just never shows).
//
// Target and focus bars are drawn natively by the client, which keeps a row for every hidden bar,
// so those lists stay short with the most frequent effect first (nearest the frame). In combat the
// client hides buffs on enemies and debuffs on friends, so target and focus track debuffs only.

export type Rgb = [number, number, number];

export interface TimerBar {
  /** One aura, or several separated by ", " tracked by the same bar. */
  aura: string;
  unit: "player" | "target" | "focus";
  type: "HELPFUL" | "HARMFUL";
  onlyMine: boolean;
  color: Rgb;
  /** Text shown instead of the aura name; empty keeps the name. */
  label: string;
}

export interface TimerGroup {
  /** BOTTOM of the screen: x from centre, y up, in UI units at scale 1. */
  pos: [number, number];
  bars: TimerBar[];
}

const COLOR = {
  cc: [0.85, 0.3, 0.85],
  dot: [0.55, 0.2, 0.75],
  slow: [0.4, 0.6, 0.85],
  defence: [0.3, 0.55, 0.9],
  soul: [0.6, 0.6, 0.6],
  hot: [0.25, 0.8, 0.35],
  ward: [0.95, 0.6, 0.2],
  proc: [0.95, 0.85, 0.4],
  regen: [0.4, 0.75, 0.95],
  burst: [0.9, 0.3, 0.2],
} satisfies Record<string, Rgb>;
type ColorName = keyof typeof COLOR;

/** Crowd control from every class, tracked as one bar labelled "КОНТРОЛЬ". */
const CROWD_CONTROL = [
  "Превращение", "Страх", "Вой ужаса", "Соблазн", "Изгнание", "Ментальный крик", "Контроль над разумом",
  "Ошеломление", "Ослепление", "Удар по почкам", "Парализующий удар", "Устрашающий крик", "Оглушающий удар",
  "Молот правосудия", "Покаяние", "Замораживающая ловушка", "Дезориентирующий выстрел", "Укус виверны",
  "Устрашение", "Спячка", "Гнев деревьев", "Оглушить",
];

const mine = (unit: TimerBar["unit"], type: TimerBar["type"], color: ColorName, ...auras: string[]): TimerBar =>
  ({ aura: auras.join(", "), unit, type, onlyMine: true, color: COLOR[color], label: "" });
const any = (unit: TimerBar["unit"], type: TimerBar["type"], color: ColorName, ...auras: string[]): TimerBar =>
  ({ ...mine(unit, type, color, ...auras), onlyMine: false });
const onMe = (color: ColorName, ...auras: string[]) => any("player", "HELPFUL", color, ...auras);
const myDebuff = (color: ColorName, ...auras: string[]) => mine("focus", "HARMFUL", color, ...auras);
const crowdControl = (unit: TimerBar["unit"]): TimerBar =>
  ({ ...any(unit, "HARMFUL", "cc", ...CROWD_CONTROL), label: "КОНТРОЛЬ" });

/** Per class: short effects on me, and my own debuffs to watch on the focus. */
const CLASS_BARS: Record<WowClass, { player: TimerBar[]; focus: TimerBar[] }> = {
  WARRIOR: {
    player: [onMe("burst", "Безрассудство"), onMe("proc", "Ярость берсерка"), onMe("defence", "Глухая оборона"), onMe("defence", "Возмездие"), onMe("defence", "Последний рубеж")],
    focus: [myDebuff("slow", "Подрезать сухожилия"), myDebuff("dot", "Смертельный удар"), myDebuff("dot", "Кровопускание")],
  },
  PALADIN: {
    player: [onMe("defence", "Божественный щит"), onMe("defence", "Божественная защита"), onMe("defence", "Благословение защиты"), onMe("proc", "Благословение свободы")],
    focus: [myDebuff("dot", "Правосудие света", "Правосудие мудрости", "Правосудие крестоносца", "Правосудие справедливости")],
  },
  HUNTER: {
    player: [onMe("burst", "Быстрая стрельба"), onMe("proc", "Быстрые выстрелы"), onMe("burst", "Звериный гнев"), onMe("defence", "Сдерживание")],
    focus: [myDebuff("dot", "Укус змеи"), myDebuff("dot", "Укус гадюки"), myDebuff("slow", "Подрезать крылья", "Контузящий выстрел")],
  },
  ROGUE: {
    player: [onMe("burst", "Мясорубка"), onMe("defence", "Ускользание"), onMe("proc", "Спринт"), onMe("burst", "Выброс адреналина"), onMe("burst", "Шквал клинков")],
    focus: [myDebuff("dot", "Рваная рана"), myDebuff("dot", "Гаррота"), myDebuff("slow", "Калечащий яд"), myDebuff("dot", "Смертельный яд")],
  },
  PRIEST: {
    player: [
      onMe("defence", "Слово силы: Щит"),
      any("player", "HARMFUL", "soul", "Ослабленная душа"),
      onMe("hot", "Обновление"),
      onMe("ward", "Защита от страха"),
      onMe("proc", "Придание сил"),
      mine("player", "HELPFUL", "regen", "Захват духа"),
    ],
    focus: [myDebuff("dot", "Слово Тьмы: Боль"), myDebuff("dot", "Всепожирающая чума"), myDebuff("dot", "Объятия вампира")],
  },
  SHAMAN: {
    player: [onMe("burst", "Природная стремительность"), onMe("burst", "Покорение стихий"), onMe("proc", "Шквал"), onMe("proc", "Ясность мысли")],
    focus: [myDebuff("dot", "Огненный шок"), myDebuff("slow", "Ледяной шок")],
  },
  MAGE: {
    player: [onMe("defence", "Ледяная преграда"), onMe("defence", "Ледяная глыба"), onMe("proc", "Ясность мысли"), onMe("burst", "Присутствие разума"), onMe("burst", "Чародейская мощь"), onMe("burst", "Возгорание")],
    focus: [myDebuff("slow", "Кольцо льда", "Обморожение"), myDebuff("slow", "Ледяная стрела", "Конус холода")],
  },
  WARLOCK: {
    player: [onMe("proc", "Сумеречный транс"), onMe("defence", "Защита от темной магии")],
    focus: [myDebuff("dot", "Порча"), myDebuff("dot", "Проклятие агонии"), myDebuff("dot", "Жертвенный огонь"), myDebuff("dot", "Вытягивание жизни")],
  },
  DRUID: {
    player: [onMe("proc", "Ясность мысли"), onMe("burst", "Природная стремительность"), onMe("hot", "Омоложение"), onMe("hot", "Восстановление"), onMe("defence", "Неистовое восстановление"), onMe("proc", "Порыв")],
    focus: [myDebuff("dot", "Лунный огонь"), myDebuff("dot", "Рой насекомых"), myDebuff("dot", "Глубокая рана"), myDebuff("dot", "Разорвать")],
  },
};

/** Spots just above the X-Perl player, target and focus frames in the bundled layout. */
const ANCHORS = { player: [-293, 438], target: [298, 448], focus: [562, 447] } satisfies Record<string, [number, number]>;

/** Over the player: my short effects. Over the target: crowd control. Over the focus: crowd control, then my debuffs. */
export function timerGroups(cls: WowClass): TimerGroup[] {
  const set = CLASS_BARS[cls];
  return [
    { pos: ANCHORS.player, bars: set.player },
    { pos: ANCHORS.target, bars: [crowdControl("target")] },
    { pos: ANCHORS.focus, bars: [crowdControl("focus"), ...set.focus] },
  ];
}
