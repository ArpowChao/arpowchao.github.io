'use strict';

const LuckyDraw = (() => {
  const maxSeat = 9999;
  const maxOperand = 999999;
  const ruleTypes = {
    arithmetic: { title: '等差數列', first: '首項', second: '公差' },
    geometric: { title: '等比數列', first: '首項', second: '公比' },
    factor: { title: '公因數', first: '第一個整數', second: '第二個整數' },
    add: { title: '加法', first: '被加數', second: '加數' },
    subtract: { title: '減法', first: '被減數', second: '減數' },
    multiple: { title: '倍數', first: '基數' },
  };

  function parseRoster(text) {
    const occupied = new Set();
    const students = [];
    const lines = text.split(/\r?\n/);
    for (const [index, input] of lines.entries()) {
      const line = input.trim();
      if (!line) continue;
      const explicit = /^([0-9０-９]+)(?:\s*[,，、:：]\s*|\s+)(.*)$/.exec(line);
      const seatText = explicit?.[1] ?? (/^[0-9０-９]+$/.test(line) ? line : '');
      const name = explicit ? explicit[2].trim() : seatText ? '' : line;
      const seat = seatText ? Number(seatText.normalize('NFKC')) : null;
      if (seat !== null && (seat < 1 || seat > maxSeat)) {
        throw new Error(`第 ${index + 1} 行的座號需介於 1 和 ${maxSeat}。`);
      }
      if (seat !== null && occupied.has(seat)) throw new Error(`第 ${index + 1} 行的座號 ${seat} 重複了。`);
      if (name.length > 60) throw new Error(`第 ${index + 1} 行的姓名最多 60 個字元。`);
      if (seat !== null) occupied.add(seat);
      students.push({ seat, name });
    }
    if (!students.length) throw new Error('請至少輸入一位同學。');
    if (students.length > maxSeat) throw new Error(`名單最多可放 ${maxSeat} 位同學。`);
    let nextSeat = 1;
    for (const student of students) {
      if (student.seat !== null) continue;
      while (occupied.has(nextSeat)) nextSeat += 1;
      student.seat = nextSeat;
      nextSeat += 1;
    }
    return students.sort((first, second) => first.seat - second.seat);
  }

  function isClockSource(source) {
    return source === 'hour' || source === 'minute';
  }

  function ruleOperand({ source, date, time, a }) {
    if (source === 'custom') return a;
    if (isClockSource(source)) {
      const parts = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
      return parts ? Number(parts[source === 'hour' ? 1 : 2]) : NaN;
    }
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!parts) return NaN;
    const [year, month, day] = parts.slice(1).map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!year || day < 1 || day > (daysInMonth[month - 1] ?? 0)) return NaN;
    return { day, month, sum: month + day, difference: month - day }[source];
  }

  function buildRule(settings) {
    const first = ruleOperand(settings);
    const type = ruleTypes[settings.type];
    const secondSource = settings.bSource ?? 'custom';
    const second = type.second ? ruleOperand({ ...settings, source: secondSource, a: settings.b }) : null;
    const validNumber = value => Number.isSafeInteger(value) && Math.abs(value) <= maxOperand;
    const errorFor = (source, name) => {
      if (source === 'custom') return `請為${name}輸入介於 −${maxOperand} 和 ${maxOperand} 的整數。`;
      if (isClockSource(source)) return '無法取得目前時間。';
      return '請填入有效的抽籤日期。';
    };
    if (!validNumber(first)) return { error: errorFor(settings.source, type.first) };
    if (type.second && !validNumber(second)) return { error: errorFor(secondSource, type.second) };
    const operandText = second < 0 ? `(${second})` : `${second}`;

    switch (settings.type) {
      case 'arithmetic':
        if (second === 0) return { error: '公差需為非零整數。' };
        return {
          label: `首項 ${first}，公差 ${second}`,
          matches: seat => (seat - first) % second === 0 && (seat - first) / second >= 0,
        };
      case 'geometric': {
        if (first < 1 || second < 2) return { error: '首項需為正整數，公比需為大於或等於 2 的整數。' };
        const terms = new Set();
        for (let term = first; term <= maxSeat; term *= second) terms.add(term);
        return { label: `首項 ${first}，公比 ${second}`, matches: seat => terms.has(seat) };
      }
      case 'factor':
        if (first === 0 && second === 0) return { error: '求公因數時，請至少填入一個非零整數。' };
        return { label: `${first} 和 ${second} 的公因數`, matches: seat => first % seat === 0 && second % seat === 0 };
      case 'add':
        return { label: `${first} ＋ ${operandText} ＝ ${first + second}`, matches: seat => seat === first + second };
      case 'subtract':
        return { label: `${first} − ${operandText} ＝ ${first - second}`, matches: seat => seat === first - second };
      case 'multiple':
        if (first === 0) return { error: '基數需為非零整數。' };
        return { label: `${first} 的倍數`, matches: seat => seat % first === 0 };
    }
  }

  function studentKey({ seat, name }) {
    return `${seat}:${name}`;
  }

  function winCounts(history) {
    const counts = new Map();
    for (const round of history) {
      for (const student of round.winners) {
        const key = studentKey(student);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }

  function candidates(roster, counts, policy, rule) {
    return roster.filter(student => (policy !== 'exclude' || !counts.has(studentKey(student))) && (!rule || rule.matches(student.seat)));
  }

  function randomUnit() {
    if (!globalThis.crypto?.getRandomValues) return Math.random();
    const buffer = crypto.getRandomValues(new Uint32Array(2));
    return (buffer[0] * 2097152 + (buffer[1] >>> 11)) / 9007199254740992;
  }

  function pick(pool, count, counts, policy, keepWeight, random = randomUnit) {
    if (!Number.isInteger(count) || count < 1 || count > pool.length) throw new RangeError('抽籤人數超出可抽範圍。');
    if (policy === 'lower') {
      const logRetention = Math.log(keepWeight / 100);
      // Exponential race in log space keeps proportional odds even after many rounds.
      return pool.map(student => ({
        student,
        priority: Math.log(-Math.log1p(-random())) - (counts.get(studentKey(student)) ?? 0) * logRetention,
      })).sort((first, second) => first.priority - second.priority).slice(0, count).map(entry => entry.student);
    }
    const remaining = pool.slice();
    for (let index = 0; index < count; index += 1) {
      const selected = index + Math.floor(random() * (remaining.length - index));
      [remaining[index], remaining[selected]] = [remaining[selected], remaining[index]];
    }
    return remaining.slice(0, count);
  }

  return { maxSeat, ruleTypes, parseRoster, buildRule, isClockSource, studentKey, winCounts, candidates, pick };
})();
