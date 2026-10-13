import { language, locale } from "../shared/i18n";

/** Russian labels for CurseForge's WoW addon categories (top level and the common subcategories). */
const CATEGORY_RU: Record<string, string> = {
  Achievements: "Достижения",
  "Action Bars": "Панели команд",
  Arena: "Арена",
  Artwork: "Оформление",
  "Auction & Economy": "Аукцион и экономика",
  "Audio & Video": "Звук и видео",
  "Bags & Inventory": "Сумки",
  Battleground: "Поля боя",
  "Battle Pets": "Боевые питомцы",
  "Boss Encounters": "Боссы",
  "Buffs & Debuffs": "Баффы и дебаффы",
  Camping: "Кемпинг",
  Caster: "Заклинатель",
  "Chat & Communication": "Чат",
  Class: "Классы",
  Combat: "Бой",
  Companions: "Питомцы",
  "Damage Dealer": "Бойцы",
  "Data Broker": "Data Broker",
  "Data Export": "Экспорт данных",
  "Development Tools": "Для разработчиков",
  Garrison: "Гарнизон",
  Guild: "Гильдия",
  Healer: "Лекари",
  Housing: "Жилище",
  HUDs: "HUD",
  Libraries: "Библиотеки",
  Mail: "Почта",
  "Map & Minimap": "Карта и миникарта",
  Minigames: "Мини-игры",
  Miscellaneous: "Разное",
  Plugins: "Плагины",
  Professions: "Профессии",
  PvP: "PvP",
  "Quests & Leveling": "Квесты и прокачка",
  "Raid Frames": "Рейдовые рамки",
  Roleplay: "Ролевая игра",
  Tank: "Танки",
  Tooltip: "Подсказки",
  Transmogrification: "Трансмогрификация",
  "Twitch Integration": "Twitch",
  "Unit Frames": "Рамки юнитов",
};

export function categoryLabel(name: string): string {
  return language() === "ru" ? (CATEGORY_RU[name] ?? name) : name;
}

export function byCategoryLabel(a: string, b: string): number {
  return categoryLabel(a).localeCompare(categoryLabel(b), locale());
}
