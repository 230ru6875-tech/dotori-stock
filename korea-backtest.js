"use strict";

const state = { dataSets: [], activeIndex: 0 };
const $ = (id) => document.getElementById(id);
const STRATEGIES = [
  { value: "ma", label: "20일선 회복 + 60일선 추세" },
  { value: "rsi", label: "RSI 과매도 반등" },
  { value: "breakout", label: "전일 변동성 돌파" }
];

function parseNumber(value) {
  if (value === undefined || value === null) return NaN;
  return Number(String(value).replace(/,/g, "").replace(/%/g, "").trim());
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.,\s]/g, "");
}

function splitSymbols(value) {
  const seen = new Set();
  return normalizeSymbol(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 12);
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "").replace(/["']/g, "");
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(text, symbol = "CSV") {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV needs a header and at least one data row.");
  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const aliases = {
    date: ["date", "datetime", "time", "날짜", "일자"],
    open: ["open", "시가"],
    high: ["high", "고가"],
    low: ["low", "저가"],
    close: ["close", "종가", "현재가"],
    volume: ["volume", "vol", "거래량"]
  };
  const index = {};
  for (const [key, names] of Object.entries(aliases)) {
    index[key] = headers.findIndex((header) => names.includes(header));
  }
  if (["date", "open", "high", "low", "close"].some((key) => index[key] < 0)) {
    throw new Error("CSV requires date/open/high/low/close columns.");
  }
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      date: cells[index.date],
      open: parseNumber(cells[index.open]),
      high: parseNumber(cells[index.high]),
      low: parseNumber(cells[index.low]),
      close: parseNumber(cells[index.close]),
      volume: index.volume >= 0 ? parseNumber(cells[index.volume]) : 0
    };
  }).filter((row) => row.date && [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { symbol, name: symbol, rows, source: "CSV" };
}

function generateSampleRows(symbol = "005930") {
  const rows = [];
  let price = 72000;
  const start = new Date("2025-01-02T00:00:00+09:00");
  let tradingDay = 0;
  for (let i = 0; i < 520; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const day = date.getDay();
    if (day === 0 || day === 6) continue;
    const wave = Math.sin(tradingDay / 11) * 0.012 + Math.sin(tradingDay / 37) * 0.018;
    const drift = tradingDay > 80 && tradingDay < 180 ? 0.002 : tradingDay > 260 ? -0.0008 : 0.0006;
    const shock = tradingDay % 53 === 0 ? 0.035 : tradingDay % 41 === 0 ? -0.028 : 0;
    const change = drift + wave + shock;
    const open = price * (1 + Math.sin(tradingDay / 7) * 0.004);
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + 0.006 + Math.abs(Math.sin(tradingDay / 5)) * 0.008);
    const low = Math.min(open, close) * (1 - 0.006 - Math.abs(Math.cos(tradingDay / 9)) * 0.007);
    rows.push({
      date: date.toISOString().slice(0, 10),
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      volume: 1000000 + Math.round(Math.abs(change) * 90000000) + tradingDay * 1300
    });
    price = close;
    tradingDay += 1;
  }
  return { symbol, name: "샘플 종목", rows, source: "Sample" };
}

function sma(rows, index, length, field = "close") {
  if (index + 1 < length) return null;
  let sum = 0;
  for (let i = index - length + 1; i <= index; i += 1) sum += rows[i][field] || 0;
  return sum / length;
}

function rsi(rows, index, length = 14) {
  if (index < length) return null;
  let gain = 0;
  let loss = 0;
  for (let i = index - length + 1; i <= index; i += 1) {
    const diff = rows[i].close - rows[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  if (loss === 0) return 100;
  return 100 - (100 / (1 + gain / loss));
}

function shouldEnter(rows, index, strategy) {
  const row = rows[index];
  const prev = rows[index - 1];
  if (!prev) return false;
  if (strategy === "ma") {
    const ma20 = sma(rows, index, 20);
    const ma60 = sma(rows, index, 60);
    const prevMa20 = sma(rows, index - 1, 20);
    return ma20 && ma60 && prevMa20 && prev.close <= prevMa20 && row.close > ma20 && ma20 > ma60;
  }
  if (strategy === "rsi") {
    const prevRsi = rsi(rows, index - 1);
    const nowRsi = rsi(rows, index);
    return prevRsi !== null && nowRsi !== null && prevRsi < 32 && nowRsi >= 34 && row.close > row.open;
  }
  if (strategy === "breakout") {
    const target = prev.close + (prev.high - prev.low) * 0.55;
    const volumeAvg = sma(rows, index - 1, 20, "volume");
    return volumeAvg && row.high >= target && row.close >= target && row.volume > volumeAvg * 1.15;
  }
  return false;
}

function runBacktest(rows, settings) {
  let cash = settings.initialCash;
  let shares = 0;
  let entryPrice = 0;
  let entryDate = "";
  let entryIndex = 0;
  let peak = settings.initialCash;
  let maxDrawdown = 0;
  const trades = [];
  const equity = [];
  const oneWayCost = settings.feeRate / 100 / 2;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (shares > 0) {
      const returnPct = ((row.close / entryPrice) - 1) * 100;
      let exitReason = "";
      if (settings.stopLoss > 0 && returnPct <= -settings.stopLoss) exitReason = "손절";
      if (!exitReason && settings.takeProfit > 0 && returnPct >= settings.takeProfit) exitReason = "익절";
      if (!exitReason && i - entryIndex >= settings.holdingDays) exitReason = "보유기간 만료";
      if (exitReason) {
        const exitValue = shares * row.close * (1 - oneWayCost);
        const grossEntry = shares * entryPrice;
        cash = exitValue;
        trades.push({ entryDate, exitDate: row.date, entryPrice, exitPrice: row.close, returnPct: ((exitValue / grossEntry) - 1) * 100, reason: exitReason });
        shares = 0;
        entryPrice = 0;
      }
    }
    if (shares === 0 && shouldEnter(rows, i, settings.strategy)) {
      entryPrice = row.close;
      shares = Math.floor((cash * (1 - oneWayCost)) / entryPrice);
      if (shares > 0) {
        cash -= shares * entryPrice * (1 + oneWayCost);
        entryDate = row.date;
        entryIndex = i;
      }
    }
    const value = cash + shares * row.close;
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, ((value / peak) - 1) * 100);
    equity.push({ date: row.date, value });
  }

  if (shares > 0) {
    const last = rows[rows.length - 1];
    const exitValue = shares * last.close * (1 - oneWayCost);
    const grossEntry = shares * entryPrice;
    cash = exitValue;
    trades.push({ entryDate, exitDate: last.date, entryPrice, exitPrice: last.close, returnPct: ((exitValue / grossEntry) - 1) * 100, reason: "마지막 데이터 청산" });
    equity[equity.length - 1].value = cash;
  }

  const totalReturn = ((cash / settings.initialCash) - 1) * 100;
  const wins = trades.filter((trade) => trade.returnPct > 0).length;
  return { totalReturn, maxDrawdown, winRate: trades.length ? wins / trades.length * 100 : 0, trades, equity };
}

function formatPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPrice(value) {
  return Math.round(value).toLocaleString("ko-KR");
}

function drawChart(points) {
  const canvas = $("equityChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (!points.length) return;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 36;
  const spread = Math.max(1, max - min);

  ctx.strokeStyle = "#dce2ec";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = pad + (height - pad * 2) * (i / 4);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = pad + (width - pad * 2) * (index / Math.max(1, points.length - 1));
    const y = height - pad - ((point.value - min) / spread) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#5d6678";
  ctx.font = "13px Arial";
  ctx.fillText(formatPrice(max), pad, 22);
  ctx.fillText(formatPrice(min), pad, height - 12);
}

function collectSettings() {
  return {
    strategy: $("strategySelect").value,
    initialCash: Math.max(100000, parseNumber($("initialCash").value) || 10000000),
    feeRate: Math.max(0, parseNumber($("feeRate").value) || 0),
    holdingDays: Math.max(1, parseNumber($("holdingDays").value) || 7),
    stopLoss: Math.max(0, parseNumber($("stopLoss").value) || 0),
    takeProfit: Math.max(0, parseNumber($("takeProfit").value) || 0)
  };
}

function setStatus(message, isError = false) {
  const status = $("backtestStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function resultScore(result) {
  return result.totalReturn + result.maxDrawdown * 0.45 + result.winRate * 0.05;
}

function selectedStrategies() {
  const selected = $("strategySelect").value;
  if (selected === "all") return STRATEGIES;
  return STRATEGIES.filter((strategy) => strategy.value === selected);
}

function renderSummary(results) {
  const sorted = [...results].sort((a, b) => resultScore(b.result) - resultScore(a.result));
  const best = sorted[0];
  $("metricReturn").textContent = best ? formatPct(best.result.totalReturn) : "-";
  $("metricReturn").className = best?.result.totalReturn >= 0 ? "up" : "down";
  $("metricDrawdown").textContent = best ? formatPct(best.result.maxDrawdown) : "-";
  $("metricDrawdown").className = "down";
  $("metricWinRate").textContent = best ? `${best.result.winRate.toFixed(1)}%` : "-";
  $("metricTrades").textContent = best ? String(best.result.trades.length) : "-";

  const rows = sorted.map((item, index) => `
    <tr>
      <td><button class="small-button result-select" type="button" data-result-id="${item.resultId}">${item.symbol}</button></td>
      <td>${item.name || item.symbol}</td>
      <td>${item.strategyLabel}</td>
      <td class="${item.result.totalReturn >= 0 ? "up" : "down"}">${formatPct(item.result.totalReturn)}</td>
      <td class="down">${formatPct(item.result.maxDrawdown)}</td>
      <td>${item.result.winRate.toFixed(1)}%</td>
      <td>${item.result.trades.length}</td>
      <td>${index === 0 ? "상위" : "비교"}</td>
    </tr>
  `).join("");
  $("resultTableBody").innerHTML = rows || '<tr><td colspan="8">결과가 없습니다.</td></tr>';
}

function renderDetail(item) {
  if (!item) return;
  const rows = item.rows;
  const result = item.result;
  $("periodLabel").textContent = `${item.symbol} · ${item.strategyLabel} · ${rows[0].date} - ${rows[rows.length - 1].date} · ${item.source || ""}`;
  $("tradeCountLabel").textContent = `${result.trades.length}건`;
  drawChart(result.equity);
  const avgTrade = result.trades.length
    ? result.trades.reduce((sum, trade) => sum + trade.returnPct, 0) / result.trades.length
    : 0;
  const notes = [
    `${item.name || item.symbol} ${rows.length.toLocaleString("ko-KR")}개 일봉을 ${item.strategyLabel} 전략으로 계산했습니다.`,
    result.trades.length ? `평균 거래 수익률은 ${formatPct(avgTrade)}입니다.` : "조건에 맞는 진입 신호가 없었습니다.",
    result.maxDrawdown <= -15 ? "최대낙폭이 큽니다. 실전 적용 전 손절과 포지션 크기를 더 보수적으로 조정해야 합니다." : "낙폭은 제한적이지만 다른 기간과 전략으로 재검증해야 합니다.",
    "국내 종목 데이터는 네이버증권 차트를 우선 사용하고, 실패 시 보조 차트 데이터 또는 업로드 CSV를 사용합니다. 호가 공백과 체결 실패는 별도 모델링하지 않습니다."
  ];
  $("resultNotes").innerHTML = notes.map((note) => `<li>${note}</li>`).join("");
  const rowsHtml = result.trades.slice(-20).reverse().map((trade) => `
    <tr>
      <td>${item.name || item.symbol} (${item.symbol})</td>
      <td>${item.strategyLabel}</td>
      <td>${trade.entryDate}</td>
      <td>${trade.exitDate}</td>
      <td>${formatPrice(trade.entryPrice)}</td>
      <td>${formatPrice(trade.exitPrice)}</td>
      <td class="${trade.returnPct >= 0 ? "up" : "down"}">${formatPct(trade.returnPct)}</td>
      <td>${trade.reason}</td>
    </tr>
  `).join("");
  $("tradeTableBody").innerHTML = rowsHtml || '<tr><td colspan="8">거래내역이 없습니다.</td></tr>';
}

function runAllBacktests() {
  const settings = collectSettings();
  const strategies = selectedStrategies();
  const results = state.dataSets
    .filter((dataSet) => dataSet.rows && dataSet.rows.length >= 80)
    .flatMap((dataSet, dataIndex) => strategies.map((strategy) => ({
      ...dataSet,
      dataIndex,
      resultId: `${dataIndex}-${strategy.value}`,
      strategy: strategy.value,
      strategyLabel: strategy.label,
      result: runBacktest(dataSet.rows, { ...settings, strategy: strategy.value })
    })));
  state.results = results;
  renderSummary(results);
  const sorted = [...results].sort((a, b) => resultScore(b.result) - resultScore(a.result));
  state.activeResultId = sorted[0]?.resultId || "";
  renderDetail(sorted[0]);
  if (results.length) {
    setStatus(`${state.dataSets.length}개 종목, ${strategies.length}개 전략의 백테스트를 완료했습니다. 표의 종목 버튼을 누르면 상세 결과가 바뀝니다.`);
  }
}

async function fetchSymbolData(symbols) {
  const url = new URL("./api/korea-backtest", window.location.href);
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("range", $("rangeSelect").value);
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "data_fetch_failed");
  const failures = payload.results.filter((item) => !item.ok);
  const successes = payload.results.filter((item) => item.ok && Array.isArray(item.rows));
  if (!successes.length) throw new Error(failures.map((item) => `${item.symbol}: ${item.error}`).join(" / ") || "No usable symbol data.");
  if (failures.length) setStatus(`일부 실패: ${failures.map((item) => `${item.symbol}(${item.error})`).join(", ")}`, true);
  return successes;
}

window.addEventListener("DOMContentLoaded", () => {
  $("loadSampleButton").addEventListener("click", () => {
    state.dataSets = [generateSampleRows("005930"), generateSampleRows("000660"), generateSampleRows("035420")];
    $("symbolInputBacktest").value = "005930,000660,035420";
    runAllBacktests();
  });

  $("csvFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const symbol = $("symbolInputBacktest").value.trim() || file.name.replace(/\.csv$/i, "");
      const dataSet = parseCsv(await file.text(), symbol);
      if (dataSet.rows.length < 80) throw new Error("At least 80 daily rows are required.");
      state.dataSets = [dataSet];
      runAllBacktests();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  $("backtestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const symbols = splitSymbols($("symbolInputBacktest").value);
      if (symbols.length) {
        setStatus(`${symbols.length}개 종목 데이터를 조회하는 중입니다.`);
        state.dataSets = await fetchSymbolData(symbols);
      } else if (!state.dataSets.length) {
        throw new Error("종목코드를 입력하거나 CSV를 업로드하십시오.");
      }
      runAllBacktests();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  $("resultTableBody").addEventListener("click", (event) => {
    const button = event.target.closest(".result-select");
    if (!button) return;
    const item = state.results.find((entry) => entry.resultId === button.dataset.resultId);
    renderDetail(item);
  });
});
