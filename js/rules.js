// =====================================================================
//  THE ZOMBIES 5.0 — shared rules (browser + server).
//  Achievements, ranks, daily tasks, classes, shop, anti-cheat limits.
//  The server loads this very file, so progress is checked by the same
//  numbers the game shows.
// =====================================================================
(function (root, factory) {
  const R = factory();
  if (typeof module === 'object' && module.exports) module.exports = R;
  else { root.TZ = root.TZ || {}; root.TZ.RULES = R; }
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const RANKS = [
  { min: -1e9, name: 'Новичок', color: '#9a9a8c' }, { min: 800, name: 'Бронза', color: '#c07a3a' }, { min: 1100, name: 'Серебро', color: '#c8d0d8' },
  { min: 1400, name: 'Золото', color: '#f0c040' }, { min: 1800, name: 'Платина', color: '#6fe0d0' }, { min: 2300, name: 'Алмаз', color: '#7ab8ff' }, { min: 2900, name: 'Легенда', color: '#ff5a4a' },
];

// reward: medal always; optional frame / bg / avatar. coins = rn * 2
const ACH = [
  { id: 'first_blood', name: 'Первая кровь', desc: 'Убейте первого зомби', stat: 'kills', n: 1, rn: 5, medal: ['circle', '#c07a3a', 'skull'] },
  { id: 'kills100', name: 'Мясорубка', desc: 'Убейте 100 зомби', stat: 'kills', n: 100, rn: 20, medal: ['circle', '#c8d0d8', 'skull'], frame: 'rust', avatar: 'z_walker' },
  { id: 'kills1000', name: 'Жнец', desc: 'Убейте 1000 зомби', stat: 'kills', n: 1000, rn: 60, medal: ['star', '#f0c040', 'skull'], frame: 'blood', bg: 'horde' },
  { id: 'kills5000', name: 'Конец света', desc: 'Убейте 5000 зомби', stat: 'kills', n: 5000, rn: 150, medal: ['star', '#ff5a4a', 'skull'], frame: 'legend' },
  { id: 'night1', name: 'Первая ночь', desc: 'Переживите первую ночь', stat: 'nights', n: 1, rn: 5, medal: ['circle', '#7a8ab0', 'moon'] },
  { id: 'night5', name: 'Ветеран', desc: 'Доживите до 6-го дня в одном мире', stat: 'maxDay', n: 6, rn: 25, medal: ['shield', '#c8d0d8', 'moon'], frame: 'steel' },
  { id: 'night15', name: 'Легенда пустошей', desc: 'Доживите до 16-го дня', stat: 'maxDay', n: 16, rn: 60, medal: ['shield', '#f0c040', 'moon'], bg: 'bloodmoon' },
  { id: 'night30', name: 'Бессмертный', desc: 'Доживите до 31-го дня', stat: 'maxDay', n: 31, rn: 120, medal: ['star', '#ff5a4a', 'moon'], frame: 'gold', bg: 'ash' },
  { id: 'hard5', name: 'Кошмар наяву', desc: 'Переживите 5 ночей на сложности «Кошмар»', stat: 'hardNights', n: 5, rn: 80, medal: ['star', '#a02020', 'eye'], frame: 'nightmare', bg: 'inferno' },
  { id: 'builder', name: 'Строитель', desc: 'Постройте 25 укреплений', stat: 'built', n: 25, rn: 10, medal: ['circle', '#c07a3a', 'brick'] },
  { id: 'architect', name: 'Архитектор', desc: 'Постройте 300 укреплений', stat: 'built', n: 300, rn: 50, medal: ['shield', '#f0c040', 'brick'], bg: 'fortress', frame: 'stone' },
  { id: 'team3', name: 'Своя команда', desc: 'Наберите 3 выживших', stat: 'recruited', n: 3, rn: 15, medal: ['circle', '#5fd0ff', 'people'] },
  { id: 'team10', name: 'Армия', desc: 'Наберите 10 выживших', stat: 'recruited', n: 10, rn: 40, medal: ['shield', '#5fd0ff', 'people'], avatar: 'surv' },
  { id: 'pilot', name: 'Пилот', desc: 'Пролетите 3 км на вертолёте или самолёте', stat: 'airKm', n: 3, rn: 40, medal: ['star', '#9ad8ff', 'heli'] },
  { id: 'sailor', name: 'Капитан', desc: 'Проплывите 1 км на лодке или катере', stat: 'boatKm', n: 1, rn: 20, medal: ['circle', '#5aa0d0', 'fish'] },
  { id: 'homebuilder', name: 'Свой дом', desc: 'Постройте 20 клеток крыши', stat: 'roofs', n: 20, rn: 25, medal: ['shield', '#c87a4a', 'brick'] },
  { id: 'driver', name: 'Водитель', desc: 'Проедьте 1 км', stat: 'km', n: 1, rn: 10, medal: ['circle', '#c8d0d8', 'wheel'] },
  { id: 'trucker', name: 'Дальнобойщик', desc: 'Проедьте 50 км', stat: 'km', n: 50, rn: 50, medal: ['star', '#f0c040', 'wheel'], bg: 'highway' },
  { id: 'mechanic', name: 'Механик', desc: 'Почините машину 10 раз', stat: 'repairs', n: 10, rn: 20, medal: ['circle', '#e8a030', 'wrench'] },
  { id: 'boomer', name: 'Взрывотехник', desc: 'Убейте 10 зомби одним взрывом', stat: 'bigBoom', n: 1, rn: 30, medal: ['star', '#ff8a30', 'bomb'], avatar: 'z_exploder' },
  { id: 'boss', name: 'Убийца Бегемота', desc: 'Убейте Бегемота', stat: 'k_boss', n: 1, rn: 60, medal: ['star', '#a02020', 'skull'], frame: 'behemoth', avatar: 'z_boss' },
  { id: 'brutes', name: 'Укротитель громил', desc: 'Убейте 25 громил', stat: 'k_brute', n: 25, rn: 30, medal: ['shield', '#7a8a60', 'fist'], avatar: 'z_brute' },
  { id: 'soldiers', name: 'Дезертир', desc: 'Убейте 50 зомби-солдат', stat: 'k_soldier', n: 50, rn: 30, medal: ['shield', '#56643a', 'helmet'], avatar: 'z_soldier' },
  { id: 'evac', name: 'Спасение', desc: 'Дождитесь эвакуации', stat: 'evac', n: 1, rn: 100, medal: ['star', '#7ad870', 'heli'], bg: 'heli', frame: 'hero' },
  { id: 'polar', name: 'Полярник', desc: 'Убейте 25 ледяных зомби', stat: 'k_frozen', n: 25, rn: 25, medal: ['circle', '#9ad8ff', 'flake'], frame: 'ice', bg: 'snow', avatar: 'z_frozen' },
  { id: 'traveler', name: 'Путешественник', desc: 'Посетите все 6 биомов', stat: 'biomeCount', n: 6, rn: 40, medal: ['star', '#7ad870', 'compass'], bg: 'swamp' },
  { id: 'explorer', name: 'Исследователь', desc: 'Откройте 300 участков карты', stat: 'chunks', n: 300, rn: 40, medal: ['shield', '#7ab8ff', 'compass'], frame: 'toxic' },
  { id: 'hunter', name: 'Охотник', desc: 'Добудьте 15 животных', stat: 'animals', n: 15, rn: 20, medal: ['circle', '#a07040', 'paw'], avatar: 'wolf' },
  { id: 'bear', name: 'Медвежатник', desc: 'Убейте медведя', stat: 'bears', n: 1, rn: 30, medal: ['shield', '#6a4a30', 'paw'], avatar: 'bear' },
  { id: 'sniper', name: 'Снайпер', desc: 'Сделайте 100 выстрелов в голову', stat: 'heads', n: 100, rn: 30, medal: ['star', '#c8d0d8', 'cross'], frame: 'sniper' },
  { id: 'melee', name: 'Мастер ближнего боя', desc: 'Убейте 300 зомби в ближнем бою', stat: 'meleeKills', n: 300, rn: 30, medal: ['shield', '#c8d0d8', 'blade'] },
  { id: 'pyro', name: 'Пироман', desc: 'Сожгите 150 зомби', stat: 'fireKills', n: 150, rn: 30, medal: ['star', '#ff8a30', 'flame'], frame: 'fire' },
  { id: 'teamplay', name: 'Командный игрок', desc: 'Сыграйте в мультиплеере', stat: 'mpGames', n: 1, rn: 10, medal: ['circle', '#5fd0ff', 'people'] },
  { id: 'duelist', name: 'Дуэлянт', desc: 'Победите 10 игроков в PvP', stat: 'pvpKills', n: 10, rn: 40, medal: ['star', '#ff5a4a', 'blade'], frame: 'duel' },
  { id: 'cook', name: 'Повар', desc: 'Съешьте 100 порций еды', stat: 'eaten', n: 100, rn: 10, medal: ['circle', '#e8a030', 'pot'] },
  { id: 'digger', name: 'Кладоискатель', desc: 'Выкопайте 5 тайников металлоискателем и лопатой', stat: 'caches', n: 5, rn: 25, medal: ['shield', '#d8b050', 'spade'] },
  { id: 'mechanic2', name: 'Безумный Макс', desc: 'Поставьте 5 улучшений на багги', stat: 'vehMods', n: 5, rn: 40, medal: ['star', '#e05030', 'wheel'] },
  { id: 'fisher', name: 'Рыбак', desc: 'Поймайте 25 рыб', stat: 'fish', n: 25, rn: 20, medal: ['circle', '#5aa0d0', 'fish'], bg: 'lake' },
  { id: 'dogfriend', name: 'Лучший друг', desc: 'Приручите собаку', stat: 'dogs', n: 1, rn: 15, medal: ['circle', '#c08040', 'paw'], avatar: 'dog' },
  { id: 'foreman', name: 'Прораб', desc: 'Улучшите молотком 20 стен', stat: 'upgrades', n: 20, rn: 20, medal: ['shield', '#a0a8b0', 'brick'] },
  { id: 'daily7', name: 'Каждый день', desc: 'Выполните все задания дня 7 раз', stat: 'dailySets', n: 7, rn: 40, medal: ['star', '#7ad870', 'check'], frame: 'daily' },
  { id: 'pocket', name: 'Карманный выживший', desc: 'Сыграйте на телефоне или планшете', stat: 'touchGames', n: 1, rn: 5, medal: ['circle', '#9ad0ff', 'phone'] },
  { id: 'crossplay', name: 'Без границ', desc: 'Сыграйте на одном сервере с игроком на другом устройстве (ПК + телефон)', stat: 'crossplay', n: 1, rn: 20, medal: ['star', '#5fd0ff', 'phone'], frame: 'cross' },
  { id: 'lumber', name: 'Лесоруб', desc: 'Срубите 100 деревьев', stat: 'trees', n: 100, rn: 15, medal: ['circle', '#7a5030', 'axe'], frame: 'wood2' },
  { id: 'classes3', name: 'Многостаночник', desc: 'Откройте 3 класса', stat: 'classes', n: 4, rn: 30, medal: ['star', '#d8b050', 'people'] },
  { id: 'friends5', name: 'Душа компании', desc: 'Добавьте 5 друзей', stat: 'friends', n: 5, rn: 20, medal: ['circle', '#ff8aa0', 'people'] },
];

const DAILY_POOL = [
  { id: 'kills', n: [40, 90, 160], t: 'Убейте {n} зомби' }, { id: 'meleeKills', n: [12, 25, 45], t: 'Убейте {n} зомби в ближнем бою' },
  { id: 'heads', n: [6, 14, 25], t: 'Попадите в голову {n} раз' }, { id: 'built', n: [12, 30, 60], t: 'Постройте {n} укреплений' },
  { id: 'looted', n: [8, 18, 30], t: 'Обыщите {n} тайников' }, { id: 'km', n: [1, 3, 6], t: 'Проедьте {n} км' },
  { id: 'fish', n: [3, 6, 10], t: 'Поймайте {n} рыб' }, { id: 'trees', n: [8, 18, 30], t: 'Срубите {n} деревьев' },
  { id: 'crafted', n: [5, 12, 20], t: 'Создайте {n} предметов' }, { id: 'eaten', n: [4, 8, 14], t: 'Поешьте {n} раз' },
  { id: 'nights', n: [1, 1, 2], t: 'Переживите ночей: {n}' }, { id: 'animals', n: [2, 4, 6], t: 'Добудьте {n} зверей' },
  { id: 'repairs', n: [3, 6, 10], t: 'Почините что-нибудь {n} раз' }, { id: 'fireKills', n: [5, 15, 30], t: 'Сожгите {n} зомби' },
];
const DAILY_RN = [8, 14, 22], DAILY_BONUS = 15;
const DAILY_COINS = [15, 25, 40], DAILY_COIN_BONUS = 50;

// deterministic daily task set: same on client and server
function dailyFor(day, accId) {
  let h = 2166136261; for (const ch of day + accId) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let s = h >>> 0; const R = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pool = DAILY_POOL.slice(), tasks = [];
  for (let tier = 0; tier < 3; tier++) { const i = (R() * pool.length) | 0, q = pool.splice(i, 1)[0]; tasks.push({ id: q.id, need: q.n[tier], got: 0, done: false, tier }); }
  return { date: day, tasks, all: false };
}

// ---------------------------------------------------------------- classes
// perk keys (multipliers unless noted):
//  hp (+max hp), spd (move speed), stam (stamina drain), melee, ranged, animal (dmg vs animals),
//  fire (fire dmg), head (extra headshot chance, +), heal (medicine effect), regen (natural regen),
//  hunger, thirst (drain), cold (warmth drain), carry (+kg), build (material cost), repair (repair amount),
//  fuel (vehicle fuel use), wood (extra wood per tree, +), fish (catch speed), loot (+extra loot chance),
//  allies (+max allies), allyDmg, stealth (zombie notice range), infect (infection chance), reload, rage (dmg when hp<35%)
const CLASSES = [
  { id: 'survivor', name: 'Выживший', icon: 'people', color: '#c8d0d8', price: 0, desc: 'Ничего особенного — только упрямство.', perks: {} },
  { id: 'hunter', name: 'Охотник', icon: 'paw', color: '#a07040', price: 400, desc: '+60% урона по зверям, +10% урона оружием, бесшумный шаг.', perks: { animal: 1.6, ranged: 1.1, stealth: 0.85 } },
  { id: 'medic', name: 'Медик', icon: 'cross', color: '#ff6a6a', price: 600, desc: 'Лекарства лечат на 60% сильнее, регенерация ×2, инфекция реже.', perks: { heal: 1.6, regen: 2, infect: 0.6 } },
  { id: 'soldier', name: 'Солдат', icon: 'helmet', color: '#56643a', price: 900, desc: '+15% урона огнестрелом, перезарядка на 25% быстрее.', perks: { ranged: 1.15, reload: 0.75 } },
  { id: 'brawler', name: 'Боец', icon: 'fist', color: '#d06030', price: 500, desc: '+30% урона в ближнем бою, +15 к здоровью.', perks: { melee: 1.3, hp: 15 } },
  { id: 'scout', name: 'Разведчик', icon: 'compass', color: '#7ab8ff', price: 600, desc: '+12% к скорости, выносливость тратится на 35% медленнее.', perks: { spd: 1.12, stam: 0.65 } },
  { id: 'engineer', name: 'Инженер', icon: 'brick', color: '#e8a030', price: 800, desc: 'Постройки дешевле на 25%.', perks: { build: 0.75 } },
  { id: 'mechanic', name: 'Механик', icon: 'wrench', color: '#c08a30', price: 700, desc: 'Топлива уходит на 35% меньше, ремонт ×2.', perks: { fuel: 0.65, repair: 2 } },
  { id: 'cook', name: 'Повар', icon: 'pot', color: '#e8c060', price: 400, desc: 'Голод и жажда растут на 30% медленнее.', perks: { hunger: 0.7, thirst: 0.7 } },
  { id: 'lumberjack', name: 'Лесоруб', icon: 'axe', color: '#7a5030', price: 400, desc: '+1 дерево с каждого ствола, +25% урона топорами.', perks: { wood: 1, axe: 1.25 } },
  { id: 'pyro', name: 'Пироман', icon: 'flame', color: '#ff8a30', price: 900, desc: 'Огонь наносит на 60% больше урона.', perks: { fire: 1.6 } },
  { id: 'sniper', name: 'Снайпер', icon: 'eye', color: '#c8d0d8', price: 1100, desc: '+12% шанс выстрела в голову, +10% урона огнестрелом.', perks: { head: 0.12, ranged: 1.1 } },
  { id: 'tank', name: 'Танк', icon: 'shield', color: '#8a96a0', price: 1000, desc: '+40 к здоровью, но на 6% медленнее.', perks: { hp: 40, spd: 0.94 } },
  { id: 'nomad', name: 'Кочевник', icon: 'compass', color: '#c0a070', price: 500, desc: '+15 кг к переносимому весу.', perks: { carry: 15 } },
  { id: 'polar', name: 'Полярник', icon: 'flake', color: '#9ad8ff', price: 500, desc: 'Холод действует вдвое слабее.', perks: { cold: 0.5 } },
  { id: 'fisher', name: 'Рыбак', icon: 'fish', color: '#5aa0d0', price: 300, desc: 'Рыба клюёт вдвое быстрее, голод на 10% медленнее.', perks: { fish: 2, hunger: 0.9 } },
  { id: 'leader', name: 'Лидер', icon: 'people', color: '#5fd0ff', price: 1300, desc: 'Союзники и собаки бьют на 35% сильнее.', perks: { allyDmg: 1.35 } },
  { id: 'shadow', name: 'Тень', icon: 'moon', color: '#7a6ab0', price: 1200, desc: 'Зомби замечают вас на 40% ближе.', perks: { stealth: 0.6 } },
  { id: 'scavenger', name: 'Мародёр', icon: 'spade', color: '#d8b050', price: 800, desc: '+35% шанс найти лишний предмет в тайниках.', perks: { loot: 0.35 } },
  { id: 'virolog', name: 'Вирусолог', icon: 'cross', color: '#7ad870', price: 700, desc: 'Заражение и болезни в 4 раза реже.', perks: { infect: 0.25 } },
  { id: 'berserk', name: 'Берсерк', icon: 'skull', color: '#a02020', price: 1500, desc: 'При здоровье ниже 35% урон ×1.6, +10% урона в ближнем бою.', perks: { rage: 1.6, melee: 1.1 } },
];
const CLASS = {}; for (const c of CLASSES) CLASS[c.id] = c;
function perk(cls, key, def) { const c = CLASS[cls]; const v = c && c.perks[key]; return v == null ? def : v; }

// ---------------------------------------------------------------- shop (real money, YooMoney)
// coins: in-game currency; items: delivered as a claimable kit in any world
const PRODUCTS = [
  { id: 'kit_survival', name: 'Набор выживания', price: 99, coins: 200, icon: 'pot', items: { water: 4, canned: 4, bandage: 4, medkit: 1, ammo9: 40, flashlight: 1, bp_small: 1 }, desc: 'Еда, вода, бинты, патроны и рюкзак — чтобы пережить первые ночи.' },
  { id: 'kit_medic', name: 'Аптечка полевая', price: 99, coins: 150, icon: 'cross', items: { medkit: 4, bandage: 8, antibio: 3, painkill: 3, adrenaline: 1 }, desc: 'Всё, чтобы не умереть от укуса.' },
  { id: 'kit_guns', name: 'Набор оружейника', price: 199, coins: 400, icon: 'blade', items: { shotgun: 1, ammo12: 40, ak: 1, ammo762: 120, grenade: 4, vest: 1 }, desc: 'Дробовик, автомат, гранаты и бронежилет.' },
  { id: 'kit_builder', name: 'Набор строителя', price: 149, coins: 300, icon: 'brick', items: { wood: 120, stone: 80, metal: 60, brick: 40, concrete: 20, hammer: 1, rope: 10 }, desc: 'Материалы на крепость с крышей.' },
  { id: 'kit_mechanic', name: 'Набор механика', price: 199, coins: 300, icon: 'wrench', items: { fuel: 10, wheel: 4, battery: 2, engine: 1, repairkit: 3, parts: 20, wrench: 1 }, desc: 'Поставить машину на колёса за минуту.' },
  { id: 'kit_hunter', name: 'Набор охотника', price: 129, coins: 250, icon: 'paw', items: { bow: 1, arrow: 60, rifle: 1, ammo762: 40, rod: 1, parka: 1 }, desc: 'Лук, винтовка, удочка и тёплая парка.' },
  { id: 'kit_legion', name: 'Пак «Легион»', price: 149, coins: 300, icon: 'star', cosmetics: { frame: 'legion', bg: 'legion' }, desc: 'Эксклюзивная анимированная рамка и фон профиля.' },
  { id: 'coins_s', name: '500 монет', price: 99, coins: 500, icon: 'coin', desc: 'Монеты на классы и наборы.' },
  { id: 'coins_m', name: '1300 монет', price: 199, coins: 1300, icon: 'coin', desc: '+30% выгоднее.', best: 0 },
  { id: 'coins_l', name: '3500 монет', price: 449, coins: 3500, icon: 'coin', desc: '+55% выгоднее.', best: 1 },
  { id: 'coins_xl', name: '8000 монет', price: 899, coins: 8000, icon: 'coin', desc: 'Максимальная выгода.' },
  { id: 'mega', name: 'Мега-набор', price: 499, coins: 1500, icon: 'star', items: { shotgun: 1, ammo12: 60, medkit: 4, canned: 8, water: 8, bp_big: 1, helmet: 1, vest: 1, fuel: 6, wood: 80, metal: 40 }, classes: ['soldier', 'medic'], desc: 'Классы Солдат и Медик + большой набор снаряжения.' },
  { id: 'server', name: 'Общий сервер (30 дней)', price: 400, icon: 'globe', server: 30, desc: 'Ваш сервер в общем списке у всех игроков: название, хештеги, PvP, баны.' },
];
const PRODUCT = {}; for (const p of PRODUCTS) PRODUCT[p.id] = p;
// kits sold for in-game coins too
const COIN_KITS = { kit_survival: 350, kit_medic: 300, kit_builder: 500, kit_hunter: 450, kit_mechanic: 550 };

// ---------------------------------------------------------------- anti-cheat limits
// stat growth allowed per real minute of play; `burst` = allowance kept in the bucket
// (offline play up to BUCKET_MIN minutes is accepted when syncing later).
const BUCKET_MIN = 240;
const STAT_RATE = {
  kills: 80, meleeKills: 45, fireKills: 60, heads: 50, k_walker: 80, k_runner: 50, k_crawler: 40, k_brute: 10, k_spitter: 15, k_soldier: 25, k_frozen: 30, k_boss: 0.2, k_exploder: 25, k_screamer: 10,
  animals: 6, bears: 0.5, built: 40, crafted: 40, looted: 25, items: 300, trees: 15, chunks: 30, fish: 4, eaten: 6, repairs: 6, upgrades: 15, caches: 1, vehMods: 1, dogs: 0.3,
  km: 3.5, airKm: 6, boatKm: 3, nights: 1 / 7, hardNights: 1 / 7, evac: 1 / 30, bigBoom: 0.5, recruited: 1.5, mpGames: 1, touchGames: 1, crossplay: 1, roofs: 30, shots: 400, deaths: 4, pvpKills: 4, dailySets: 0,
};
const DEFAULT_RATE = 20;
// RN events: most RN comes from events the server checks against stat deltas
const RN_RULES = {
  night: (day, mul) => Math.round((8 + Math.min(day, 200) * 2) * mul),
  boss: (mul) => Math.round(40 * mul), evac: (mul) => Math.round(120 * mul), death: (mul) => -Math.round(20 * (mul > 1 ? 1.4 : 1)),
};
const DIFF_RN = { easy: 0.5, normal: 1, hard: 1.6 };
const COIN_RULES = { night: 5, boss: 25, evac: 100, achMul: 2 };


// ---------------------------------------------------------------- cosmetics (unlocked by achievements or purchases)
const FRAMES = {
  none: { name: 'Без рамки', free: 1 }, wood: { name: 'Деревянная', free: 1 }, iron: { name: 'Железная', free: 1 },
  rust: { name: 'Ржавая' }, steel: { name: 'Стальная' }, stone: { name: 'Каменная' }, wood2: { name: 'Лесная' }, blood: { name: 'Кровавая' }, gold: { name: 'Золотая' },
  ice: { name: 'Ледяная' }, fire: { name: 'Огненная', anim: 1 }, toxic: { name: 'Токсичная', anim: 1 }, behemoth: { name: 'Бегемот' }, nightmare: { name: 'Кошмар', anim: 1 },
  hero: { name: 'Герой' }, sniper: { name: 'Прицел' }, duel: { name: 'Дуэлянт' }, legend: { name: 'Легенда', anim: 1 },
  daily: { name: 'Упорство' }, cross: { name: 'Без границ', anim: 1 }, legion: { name: 'Легион', anim: 1, shop: 'kit_legion' },
};
const BGS = {
  dusk: { name: 'Сумерки', free: 1 }, forest: { name: 'Осенний лес', free: 1 }, snow: { name: 'Тайга' }, highway: { name: 'Трасса' }, fortress: { name: 'Крепость' },
  bloodmoon: { name: 'Кровавая луна' }, ash: { name: 'Пепелище' }, heli: { name: 'Эвакуация' }, inferno: { name: 'Преисподняя' }, swamp: { name: 'Болота' }, horde: { name: 'Орда' }, lake: { name: 'Тихое озеро' },
  legion: { name: 'Легион', shop: 'kit_legion' },
};
const AVATARS = {
  self: { name: 'Ваш персонаж', free: 1 }, look1: { name: 'Охотник', free: 1 }, look2: { name: 'Байкер', free: 1 }, look3: { name: 'Медик', free: 1 },
  z_walker: { name: 'Ходячий' }, z_exploder: { name: 'Взрывун' }, z_boss: { name: 'Бегемот' }, z_brute: { name: 'Громила' }, z_soldier: { name: 'Солдат' }, z_frozen: { name: 'Ледяной' },
  wolf: { name: 'Волк' }, bear: { name: 'Медведь' }, surv: { name: 'Командир' }, dog: { name: 'Пёс' },
};

function rankOf(rn) { let r = RANKS[0]; for (const k of RANKS) if (rn >= k.min) r = k; return r; }
function levelOf(rn) { return Math.max(1, Math.floor(rn / 100)); }

return { VERSION: '5.0.0', RANKS, ACH, DAILY_POOL, DAILY_RN, DAILY_BONUS, DAILY_COINS, DAILY_COIN_BONUS, dailyFor, CLASSES, CLASS, perk, PRODUCTS, PRODUCT, COIN_KITS, BUCKET_MIN, STAT_RATE, DEFAULT_RATE, RN_RULES, DIFF_RN, COIN_RULES, rankOf, levelOf, FRAMES, BGS, AVATARS };
});
