/**
 * 农历 / 节气 / 干支 / 黄历宜忌（纯逻辑，无 DOM / 无 chrome.*，可单测）
 *
 * 覆盖 1900–2100 年：
 * - 农历：标准位掩码表换算阳历 → 农历（含闰月）
 * - 节气：寿星通用公式（1900–2100 误差极小，按日取整）
 * - 干支：年（农历年为界）/ 月（节气月为界，五虎遁）/ 日（2000-01-07 甲子日为基准）
 * - 宜忌：建除十二值日（传统黄历通行口径），按日支与月建推值日，各值日一套固定宜忌
 * - 节日：阳历固定节日 + 农历节日（含除夕按当年腊月天数判定）
 */

/** 1900–2100 年农历数据：低 4 位 = 闰月月份（0 = 无闰），0x8000–0x10 位 = 十二个月大小（1 = 30 天），0x10000 = 闰月天数（1 = 30 天） */
const LUNAR_INFO: readonly number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
];

const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const ZODIAC = '鼠牛虎兔龙蛇马羊猴鸡狗猪';
const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/** 某年农历数据（表外返回 0：农历换算会退化为不闰、全小月，仅用于防御） */
const infoOf = (y: number): number => LUNAR_INFO[y - 1900] ?? 0;

/** 闰月月份（0 = 无闰） */
const leapMonthOf = (y: number): number => infoOf(y) & 0xf;

/** 闰月天数（无闰为 0） */
const leapDaysOf = (y: number): number => {
  if (leapMonthOf(y) === 0) return 0;
  return (infoOf(y) & 0x10000) !== 0 ? 30 : 29;
};

/** 某农历月天数（不含闰月） */
const monthDaysOf = (y: number, m: number): number =>
  (infoOf(y) & (0x10000 >> m)) !== 0 ? 30 : 29;

/** 某农历年总天数 */
const yearDaysOf = (y: number): number => {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) if ((infoOf(y) & i) !== 0) sum += 1;
  return sum + leapDaysOf(y);
};

/** 农历日期 */
export interface LunarDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–30 */
  day: number;
  /** 该月是否为闰月 */
  leap: boolean;
  /** 如「八月」「闰六月」 */
  monthCn: string;
  /** 如「十五」 */
  dayCn: string;
  /** 年干支，如「丙午」 */
  ganZhiYear: string;
  /** 生肖，如「马」 */
  zodiac: string;
}

/** 阳历 → 农历（1900-01-31 起算，表外年份按边界钳制） */
export const solarToLunar = (y: number, m: number, d: number): LunarDate => {
  let offset = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
  let year = 1900;
  while (year < 2101 && offset >= yearDaysOf(year)) {
    offset -= yearDaysOf(year);
    year += 1;
  }
  const leapMonth = leapMonthOf(year);
  let leap = false;
  let i = 1;
  let temp = 0;
  /* 逐月扣减：闰月插在 leapMonth 之后（i 回退一格，改用闰月天数）；循环结束时 i 已多进一格 */
  for (; i < 13 && offset > 0; i += 1) {
    if (leapMonth > 0 && i === leapMonth + 1 && !leap) {
      i -= 1;
      leap = true;
      temp = leapDaysOf(year);
    } else {
      temp = monthDaysOf(year, i);
    }
    if (leap && i === leapMonth + 1) leap = false;
    offset -= temp;
  }
  /* offset 归零且正落在闰月后那格：按闰月/下一月二选一（经典算法的边界修正） */
  if (offset === 0 && leapMonth > 0 && i === leapMonth + 1) {
    if (leap) leap = false;
    else {
      leap = true;
      i -= 1;
    }
  }
  /* 扣过头（offset < 0）：回退到上一个月并把多扣的天数加回 */
  if (offset < 0) {
    offset += temp;
    i -= 1;
  }
  const month = i;
  const ganZhiYear = `${GAN[(year - 4) % 10] ?? '甲'}${ZHI[(year - 4) % 12] ?? '子'}`;
  return {
    year,
    month,
    day: offset + 1,
    leap,
    monthCn: `${leap ? '闰' : ''}${MONTH_CN[month - 1] ?? '正'}月`,
    dayCn: DAY_CN[offset] ?? '初一',
    ganZhiYear,
    zodiac: ZODIAC[(year - 4) % 12] ?? '鼠',
  };
};

/** 农历日的中文名（1–30） */
export const lunarDayCn = (day: number): string => DAY_CN[day - 1] ?? '初一';

/** 农历月的中文名（闰月带「闰」字） */
export const lunarMonthCn = (month: number, leap = false): string =>
  `${leap ? '闰' : ''}${MONTH_CN[month - 1] ?? '正'}月`;

/** 农历某年正月初一对应的公历日（1900 年 1 月 31 日为起点逐年的天数累加） */
const lunarNewYear = (lunarYear: number): Date => {
  let days = 0;
  for (let y = 1900; y < lunarYear; y += 1) days += yearDaysOf(y);
  const t = Date.UTC(1900, 0, 31) + days * 86400000;
  const d = new Date(t);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * 农历 → 阳历（1900–2100）。月份越界、闰月不存在、日期超出该月天数时返回 null。
 * 农历生日 / 纪念日按这个换算到每年那天的公历日期。
 */
export const lunarToSolar = (lunarYear: number, month: number, day: number, leap = false): Date | null => {
  if (lunarYear < 1900 || lunarYear > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 30) return null;
  /* 闰月不存在时按普通月处理，避免用户勾了闰月却得不到结果 */
  const leapMonth = leapMonthOf(lunarYear);
  const useLeap = leap && leapMonth === month;
  let offset = 0;
  for (let m = 1; m < month; m += 1) offset += monthDaysOf(lunarYear, m);
  if (leapMonth > 0 && leapMonth < month) offset += leapDaysOf(lunarYear);
  if (useLeap) {
    offset += monthDaysOf(lunarYear, month);
    if (day > leapDaysOf(lunarYear)) return null;
  } else if (day > monthDaysOf(lunarYear, month)) {
    return null;
  }
  const start = lunarNewYear(lunarYear);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset + day - 1);
};

/** 农历循环日的下次发生：今年（或今年之后第一个存在的农历日）不早于今天 */
export const nextLunarOccurrence = (
  month: number,
  day: number,
  now: Date,
  leap = false,
): Date | null => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (let y = now.getFullYear(); y <= 2100; y += 1) {
    const d = lunarToSolar(y, month, day, leap);
    if (d === null) continue;
    if (d.getTime() >= today) return d;
  }
  return null;
};

/* ---------- 节气 ---------- */

const TERM_INFO: readonly number[] = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693,
  263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758,
];

const TERM_NAMES: readonly string[] = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

/** 第 n 个节气（0 = 小寒）在当年的公历日 */
export const solarTermDay = (year: number, n: number): number => {
  const ms = 31556925974.7 * (year - 1900) + (TERM_INFO[n] ?? 0) * 60000 + Date.UTC(1900, 0, 6, 2, 5);
  return new Date(ms).getUTCDate();
};

/** 当天是否为节气（返回节气名，否则 null） */
export const solarTermOf = (y: number, m: number, d: number): string | null => {
  const first = (m - 1) * 2;
  for (const n of [first, first + 1]) {
    if (solarTermDay(y, n) === d) return TERM_NAMES[n] ?? null;
  }
  return null;
};

/* ---------- 干支 ---------- */

/** 日干支（2000-01-07 为甲子日，60 日一轮） */
export const dayGanZhi = (y: number, m: number, d: number): string => {
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2000, 0, 7)) / 86400000);
  const i = ((n % 60) + 60) % 60;
  return `${GAN[i % 10] ?? '甲'}${ZHI[i % 12] ?? '子'}`;
};

/**
 * 节气月支索引（子 = 0）：以当月「节」为界——1 月小寒前为子、后为丑，2 月立春前为丑、后为寅……
 * 黄历的月建按节气月而非农历月，宜忌与月干支都依赖它。
 */
export const termMonthZhi = (y: number, m: number, d: number): number => {
  const jie = solarTermDay(y, (m - 1) * 2);
  return (m - 1 + (d >= jie ? 1 : 0)) % 12;
};

/** 月干支（五虎遁：甲己之年丙作首，寅月天干 = (年干 % 5) * 2 + 2） */
export const monthGanZhi = (lunarYear: number, y: number, m: number, d: number): string => {
  const yearGan = (lunarYear - 4) % 10;
  const yinGan = ((yearGan % 5) * 2 + 2) % 10;
  const zhi = termMonthZhi(y, m, d);
  const gan = (yinGan + ((zhi - 2 + 12) % 12)) % 10;
  return `${GAN[gan] ?? '甲'}${ZHI[zhi] ?? '子'}`;
};

/* ---------- 黄历宜忌（建除十二值日） ---------- */

/** 十二值日：顺序固定，索引 = (日支 - 月支 + 12) % 12 */
const TWELVE_OFFICERS: readonly { name: string; good: string[]; bad: string[] }[] = [
  { name: '建', good: ['出行', '上任', '会友', '祈福'], bad: ['动土', '开仓', '嫁娶', '掘井'] },
  { name: '除', good: ['疗病', '除服', '出行', '拆卸'], bad: ['求官', '开市', '嫁娶', '赴任'] },
  { name: '满', good: ['祈福', '祭祀', '结亲', '开市'], bad: ['服药', '求医', '动土', '迁移'] },
  { name: '平', good: ['修墙', '平路', '祭祀', '整理'], bad: ['祈福', '求嗣', '嫁娶', '开市'] },
  { name: '定', good: ['祭祀', '祈福', '嫁娶', '造屋'], bad: ['诉讼', '出行', '交涉', '搬迁'] },
  { name: '执', good: ['祈福', '祭祀', '求子', '立约'], bad: ['搬家', '远行', '开市', '交易'] },
  { name: '破', good: ['求医', '赴考', '祭祀', '破屋'], bad: ['动土', '出行', '移徙', '修造'] },
  { name: '危', good: ['祭祀', '祈福', '安床', '拆卸'], bad: ['登山', '出行', '乘船', '登高'] },
  { name: '成', good: ['嫁娶', '开市', '修造', '安床'], bad: ['诉讼', '争议', '词讼', '破土'] },
  { name: '收', good: ['祭祀', '求财', '签约', '嫁娶'], bad: ['开市', '安葬', '破土', '出行'] },
  { name: '开', good: ['疗病', '嫁娶', '交易', '求职'], bad: ['安葬', '动土', '针灸', '伐木'] },
  { name: '闭', good: ['祭祀', '交易', '收财', '安葬'], bad: ['宴会', '安床', '出行', '求医'] },
];

/** 黄历宜忌 */
export interface Almanac {
  /** 值日名（建 / 除 / 满 …） */
  officer: string;
  good: readonly string[];
  bad: readonly string[];
  ganZhiDay: string;
  ganZhiMonth: string;
}

/** 某天的黄历宜忌（建除十二值日 + 日 / 月干支） */
export const almanacOf = (y: number, m: number, d: number): Almanac => {
  const lunar = solarToLunar(y, m, d);
  const dayZhi = ZHI.indexOf(dayGanZhi(y, m, d).charAt(1));
  const zhi = termMonthZhi(y, m, d);
  const officer = TWELVE_OFFICERS[((dayZhi - zhi) % 12 + 12) % 12] ?? TWELVE_OFFICERS[0];
  return {
    officer: officer?.name ?? '建',
    good: officer?.good ?? [],
    bad: officer?.bad ?? [],
    ganZhiDay: dayGanZhi(y, m, d),
    ganZhiMonth: monthGanZhi(lunar.year, y, m, d),
  };
};

/* ---------- 节日 ---------- */

/** 阳历固定节日（月, 日, 名称） */
const SOLAR_FESTIVALS: readonly [number, number, string][] = [
  [1, 1, '元旦'], [2, 14, '情人节'], [3, 8, '妇女节'], [3, 12, '植树节'],
  [5, 1, '劳动节'], [5, 4, '青年节'], [6, 1, '儿童节'], [7, 1, '建党节'],
  [8, 1, '建军节'], [9, 10, '教师节'], [10, 1, '国庆节'], [12, 25, '圣诞节'],
];

/** 农历节日（月, 日, 名称） */
const LUNAR_FESTIVALS: readonly [number, number, string][] = [
  [1, 1, '春节'], [1, 15, '元宵节'], [2, 2, '龙抬头'], [5, 5, '端午节'],
  [7, 7, '七夕'], [7, 15, '中元节'], [8, 15, '中秋节'], [9, 9, '重阳节'],
  [12, 8, '腊八节'], [12, 23, '小年'],
];

/**
 * 当天的节日名（阳历节日 / 农历节日 / 除夕 / 节气，可能多个，按顺序拼接）。
 * 除夕按「当年腊月是否有三十」判定，闰月不参与节日匹配。
 */
export const festivalsOf = (y: number, m: number, d: number): string[] => {
  const out: string[] = [];
  const solar = SOLAR_FESTIVALS.find(([fm, fd]) => fm === m && fd === d);
  if (solar !== undefined) out.push(solar[2]);
  const lunar = solarToLunar(y, m, d);
  if (!lunar.leap) {
    const lunarFest = LUNAR_FESTIVALS.find(([fm, fd]) => fm === lunar.month && fd === lunar.day);
    if (lunarFest !== undefined) out.push(lunarFest[2]);
    const lastDay = monthDaysOf(lunar.year, 12);
    if (lunar.month === 12 && lunar.day === lastDay) out.push('除夕');
  }
  const term = solarTermOf(y, m, d);
  if (term !== null) out.push(term);
  return out;
};

/** 农历日的中文显示：初一显示月份（如「八月」），其余显示日（如「十五」） */
export const lunarShort = (lunar: LunarDate): string =>
  lunar.day === 1 ? lunar.monthCn : lunar.dayCn;
