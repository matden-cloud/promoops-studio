import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  collectKlipRawUsage,
  fileStatusPayload,
  mentahanStatusAction,
  rawFileMeta,
  withListedFileStatus,
  withRawStatus,
} from './rawFileStatus.js';

const usage = collectKlipRawUsage([
  { id: 'KLIP1', Raw_Asset_Id: 'RAW3' },
  { id: 'KLIP2', fileName: 'tanpa raw.mp4' },
]);

describe('status mentahan', () => {
  test('identitas file dan payload memakai kolom yang ada di raw', () => {
    const meta = rawFileMeta({
      id: 'RAW1',
      Id_File: 'FILE!mentah-1',
      fileName: 'sapu baru.mp4',
      status: 'Belum Dipakai',
    }, 0, usage);
    assert.equal(meta.fileKey, 'RAW__RAW1');
    assert.equal(meta.inKlip, false);
    assert.deepEqual(fileStatusPayload({ ...meta, namaFile: meta.namaFile }, 'Sudah Dipakai'), {
      Id_File: 'FILE!mentah-1',
      Raw_Asset_Id: 'RAW1',
      Nama_File: 'sapu baru.mp4',
      status: 'Sudah Dipakai',
    });
  });

  test('file di Klip_Vidio_RAW tidak menampilkan kembali ke Belum Dipakai', () => {
    const meta = rawFileMeta({
      id: 'RAW3',
      Raw_Asset_Id: 'RAW3',
      Id_File: 'FILE!mentah-3',
      fileName: 'sapu klip.mp4',
      status: 'Sudah Dipakai',
      statusManual: false,
      statusSource: 'klip',
    }, 2, usage);
    assert.equal(meta.inKlip, true);
    const action = mentahanStatusAction({ ...meta, status: 'Sudah Dipakai' }, usage);
    assert.equal(action.canMarkUsed, false);
    assert.equal(action.canRevert, false);
    assert.match(action.hint, /Klip_Vidio_RAW/);
  });

  test('status manual boleh dikembalikan, dan hitungan sumber ikut berubah', () => {
    const file = {
      ...rawFileMeta({
        id: 'RAW2',
        Id_File: 'FILE!mentah-2',
        fileName: 'sapu manual.mp4',
        status: 'Sudah Dipakai',
        statusManual: true,
        statusSource: 'manual',
      }, 1, usage),
      status: 'Sudah Dipakai',
    };
    const action = mentahanStatusAction(file, usage);
    assert.equal(action.canRevert, true);
    assert.equal(action.canMarkUsed, false);

    const rows = withRawStatus([
      { id: 'RAW1', status: 'Belum Dipakai' },
      { id: 'RAW2', Id_File: 'FILE!mentah-2', status: 'Sudah Dipakai' },
    ], file, 'Belum Dipakai');
    assert.equal(rows[0].status, 'Belum Dipakai');
    assert.equal(rows[1].status, 'Belum Dipakai');
    assert.equal(rows.filter((row) => row.status === 'Belum Dipakai').length, 2);

    const marked = withListedFileStatus([{ ...file }], file, 'Sudah Dipakai');
    assert.equal(marked[0].status, 'Sudah Dipakai');
    assert.equal(marked[0].statusManual, true);
    assert.equal(mentahanStatusAction(marked[0], { ids: new Set(), detectable: false }).canRevert, true);
  });

  test('tanpa petunjuk sumber, kedua arah tetap ada beserta catatan', () => {
    const action = mentahanStatusAction({
      fileKey: 'RAW__tanpa',
      kategori: 'Mentahan (Raw_Asset)',
      status: 'Sudah Dipakai',
    }, { ids: new Set(), detectable: false });
    assert.equal(action.canRevert, true);
    assert.match(action.hint, /Belum Dipakai/);
    const fresh = mentahanStatusAction({ status: 'Belum Dipakai', fileKey: 'RAW__a' }, usage);
    assert.equal(fresh.canMarkUsed, true);
    assert.equal(fresh.canRevert, false);
  });

  test('snippet menulis Status_File dan tidak membuat tab', () => {
    const source = readFileSync(new URL('../apps-script/update-file-status.gs', import.meta.url), 'utf8');
    assert.equal(source.includes("action === 'update_file_status'") || source.includes('update_file_status'), true);
    assert.equal(source.includes('Status_File'), true);
    assert.equal(source.includes("status: 'success'"), true);
    assert.equal(source.includes('rawDipakaiDariStatus_'), true);
    assert.equal(/insertSheet|deleteRow|deleteRows|clearContents|\.clear\s*\(/.test(source), false);
  });
});
