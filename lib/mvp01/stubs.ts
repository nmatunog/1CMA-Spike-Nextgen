import type { CaptureResult, GiaAssistedIntake, VersaLeadImport } from './interfaces';

/** Future Versa lead import. CSV intake today uses captureProspect / previewOrImportCsv. */
export async function importVersaLead(input: VersaLeadImport): Promise<CaptureResult> {
  void input;
  throw new Error('not_implemented');
}

/** Future GIA-assisted capture. G1 should keep using captureProspect after explicit consent. */
export async function giaAssistedIntake(input: GiaAssistedIntake): Promise<CaptureResult> {
  void input;
  throw new Error('not_implemented');
}
