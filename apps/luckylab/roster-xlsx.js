'use strict';

const ClassWorkbook = (() => {
  const ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const sizeLimit = 32 * 1024 * 1024;
  const decoder = new TextDecoder();

  function zipIndex(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let footer = bytes.length - 22;
    const earliest = Math.max(0, footer - 65535);
    while (footer >= earliest &&
      (view.getUint32(footer, true) !== 0x06054b50 || footer + 22 + view.getUint16(footer + 20, true) !== bytes.length)) {
      footer -= 1;
    }
    if (footer < earliest || view.getUint16(footer + 4, true) || view.getUint16(footer + 6, true)) {
      throw new Error('無法讀取這個 .xlsx 活頁簿。');
    }
    const count = view.getUint16(footer + 10, true);
    const entries = new Map();
    let position = view.getUint32(footer + 16, true);
    for (let index = 0; index < count; index += 1) {
      if (position + 46 > footer || view.getUint32(position, true) !== 0x02014b50) throw new Error('活頁簿的檔案索引已損毀。');
      const nameLength = view.getUint16(position + 28, true);
      const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
      entries.set(name, {
        method: view.getUint16(position + 10, true),
        compressedSize: view.getUint32(position + 20, true),
        size: view.getUint32(position + 24, true),
        offset: view.getUint32(position + 42, true),
      });
      position += 46 + nameLength + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
    }

    return async name => {
      const entry = entries.get(name);
      if (!entry) return null;
      const { method, compressedSize, size, offset } = entry;
      if (size > sizeLimit || offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) {
        throw new Error('活頁簿的工作表過大或已損毀。');
      }
      const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      if (start + compressedSize > bytes.length) throw new Error('活頁簿的工作表資料不完整。');
      const compressed = bytes.subarray(start, start + compressedSize);
      if (method === 0 && compressedSize === size) return decoder.decode(compressed);
      if (method !== 8) throw new Error('請用 Excel 重新另存為 .xlsx 再匯入。');
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const reader = stream.getReader();
      const output = new Uint8Array(size);
      let written = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          output.set(value, written);
          written += value.length;
        }
      } finally {
        await reader.cancel();
      }
      if (written !== size) throw new Error('無法完整解開工作表。');
      return decoder.decode(output);
    };
  }

  function xmlDocument(text) {
    if (text === null) return null;
    const document = new DOMParser().parseFromString(text, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error('活頁簿含有無法讀取的工作表。');
    return document;
  }

  function elements(root, name) {
    return Array.from(root?.getElementsByTagNameNS('*', name) ?? []);
  }

  function stringValue(item) {
    return elements(item, 't').filter(text => text.parentElement.localName !== 'rPh').map(text => text.textContent).join('');
  }

  function cellValue(cell, strings) {
    const value = elements(cell, 'v')[0]?.textContent ?? '';
    if (cell.getAttribute('t') === 's') return strings[Number(value)] ?? '';
    if (cell.getAttribute('t') === 'inlineStr') return stringValue(cell);
    return value;
  }

  function sheetRoster(doc, strings, label) {
    const rows = elements(doc, 'row');
    let seatColumn = '';
    let nameColumn = '';
    const lines = [];
    for (const row of rows) {
      const cells = Array.from(row.children).filter(cell => cell.localName === 'c');
      const columnOf = cell => cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];
      if (!seatColumn || !nameColumn) {
        seatColumn = columnOf(cells.find(cell => cellValue(cell, strings).trim() === '座號') ?? row);
        nameColumn = columnOf(cells.find(cell => /^(?:學生)?姓名$/.test(cellValue(cell, strings).trim())) ?? row);
        continue;
      }
      const seatCell = cells.find(cell => columnOf(cell) === seatColumn);
      const nameCell = cells.find(cell => columnOf(cell) === nameColumn);
      if (!seatCell || !nameCell) continue;
      const seat = cellValue(seatCell, strings).trim().normalize('NFKC');
      const name = cellValue(nameCell, strings).trim();
      if (!/^\d+$/.test(seat) || !name) continue;
      lines.push(seat + ' ' + name.replace(/\r?\n/g, ' '));
    }
    if (!lines.length) return null;
    try {
      return { id: 'sheet:' + label, label, roster: LuckyDraw.parseRoster(lines.join('\n')), history: [] };
    } catch (error) {
      throw new Error(label + ' 工作表的名單有誤。' + error.message);
    }
  }

  async function read(file) {
    if (!/\.xlsx$/i.test(file.name) || file.size > sizeLimit) throw new Error('請選擇 32 MB 以內的 .xlsx 檔案。');
    const readEntry = zipIndex(new Uint8Array(await file.arrayBuffer()));
    const workbook = xmlDocument(await readEntry('xl/workbook.xml'));
    const relationships = xmlDocument(await readEntry('xl/_rels/workbook.xml.rels'));
    const stringTable = xmlDocument(await readEntry('xl/sharedStrings.xml'));
    const strings = elements(stringTable, 'si').map(stringValue);
    const targets = new Map(elements(relationships, 'Relationship')
      .filter(link => link.getAttribute('Type')?.endsWith('/worksheet') && link.getAttribute('TargetMode') !== 'External')
      .map(link => [link.getAttribute('Id'), link.getAttribute('Target')]));
    const classes = [];
    for (const sheet of elements(workbook, 'sheet')) {
      const id = sheet.getAttributeNS(ns, 'id') || sheet.getAttribute('r:id');
      const target = targets.get(id);
      const label = sheet.getAttribute('name')?.trim();
      if (!target || !label) continue;
      const path = new URL(target, 'https://workbook.invalid/xl/workbook.xml');
      if (path.origin !== 'https://workbook.invalid') continue;
      const entryPath = decodeURIComponent(path.pathname.slice(1));
      const imported = sheetRoster(xmlDocument(await readEntry(entryPath)), strings, label);
      if (imported) classes.push(imported);
    }
    if (!classes.length) throw new Error('找不到可匯入的名單。請確認同一列有「座號」和「姓名」欄。');
    return classes;
  }

  return { read };
})();
