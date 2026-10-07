import { useRef, useState } from "react";
import { UploadCloud, FileText, Database, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { api } from "../../lib/api";
import { LEVELS, type Department, type Role } from "../../lib/types";

interface UploadFormProps {
  roles: Role[];
  departments?: Department[];
  onDone: () => void;
  onCancel?: () => void;
}

export function UploadForm({
  roles,
  departments = [],
  onDone,
  onCancel,
}: UploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<"pdf" | "database">("pdf");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState(1);
  const [initialGrant, setInitialGrant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const acceptedExtensions = uploadType === "pdf" ? ".pdf" : ".csv,.tsv,.json,.sql";

  const handleTypeSwitch = (type: "pdf" | "database") => {
    setUploadType(type);
    setSelectedFile(null);
    setTitle("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (uploadType === "pdf" && ext !== ".pdf") {
      setError("Please select a valid PDF document (.pdf).");
      return;
    }
    if (uploadType === "database" && ![".csv", ".tsv", ".json", ".sql"].includes(ext)) {
      setError("Please select valid Database Records (.csv, .tsv, .json, .sql).");
      return;
    }
    setError("");
    setSelectedFile(file);
    if (!title) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      setTitle(cleanName);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setError(`Please select a ${uploadType === "pdf" ? "PDF" : "Database records"} file.`);
      return;
    }

    let grants: unknown[] = [];
    if (initialGrant === "*") {
      grants = [{ subject_type: "everyone" }];
    } else if (initialGrant.startsWith("role:")) {
      grants = [{ subject_type: "role", subject_id: initialGrant.replace("role:", "") }];
    } else if (initialGrant.startsWith("department:")) {
      grants = [{ subject_type: "department", subject_id: initialGrant.replace("department:", "") }];
    }

    const form = new FormData();
    form.append("file", selectedFile);
    form.append("title", title.trim() || selectedFile.name);
    form.append("classification", String(classification));
    form.append("grants", JSON.stringify(grants));

    setBusy(true);
    setError("");
    try {
      const endpoint = uploadType === "pdf" ? "/documents/upload" : "/documents/upload-database";
      await api(endpoint, { method: "POST", body: form });
      setTitle("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-5">
      {/* 1. Document Format Selector */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-surface-subtle border border-line rounded-xl">
        <button
          type="button"
          onClick={() => handleTypeSwitch("pdf")}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            uploadType === "pdf"
              ? "bg-surface text-ink shadow-xs border border-line"
              : "text-muted hover:text-ink"
          }`}
        >
          <FileText className={`h-4 w-4 ${uploadType === "pdf" ? "text-accent" : "text-muted"}`} />
          <span>PDF Document</span>
        </button>

        <button
          type="button"
          onClick={() => handleTypeSwitch("database")}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            uploadType === "database"
              ? "bg-surface text-ink shadow-xs border border-line"
              : "text-muted hover:text-ink"
          }`}
        >
          <Database className={`h-4 w-4 ${uploadType === "database" ? "text-accent" : "text-muted"}`} />
          <span>Database Records</span>
        </button>
      </div>

      {/* 2. Drag & Drop File Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          isDragOver
            ? "border-ink bg-surface-subtle"
            : selectedFile
            ? "border-emerald-500 bg-emerald-50/40"
            : "border-line bg-surface hover:border-ink/50 hover:bg-surface-subtle/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedExtensions}
          className="hidden"
          onChange={handleFileChange}
        />

        {selectedFile ? (
          <div className="flex items-center gap-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              {uploadType === "pdf" ? <FileText className="h-6 w-6" /> : <FileSpreadsheet className="h-6 w-6" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-ink truncate">{selectedFile.name}</p>
              <p className="text-[0.7rem] text-muted">
                {(selectedFile.size / 1024).toFixed(1)} KB • {uploadType === "pdf" ? "PDF Document" : "Database Records"} • Click to replace
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle text-muted">
              <UploadCloud className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-ink">
              {uploadType === "pdf"
                ? "Click to select or drag and drop a PDF file"
                : "Click to select or drag and drop Database Records (.csv, .tsv, .json, .sql)"}
            </p>
            <p className="text-[0.7rem] text-muted">
              {uploadType === "pdf" ? "Allowed: .pdf (Max 25MB)" : "Allowed: .csv, .tsv, .json, .sql (Max 25MB)"}
            </p>
          </div>
        )}
      </div>

      {/* 3. Document Details & Permissions */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-ink mb-1">Document Title</label>
          <input
            type="text"
            placeholder={uploadType === "pdf" ? "e.g. Clinical Operating Procedure 2026" : "e.g. Patient Admissions 2026"}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Classification Tier</label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={classification}
              onChange={(e) => setClassification(Number(e.target.value))}
            >
              {LEVELS.map((label, i) => (
                <option key={label} value={i}>
                  Level {i} — {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Access Scope</label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={initialGrant}
              onChange={(e) => setInitialGrant(e.target.value)}
            >
              <option value="">Private (Owner & Granular Roles Only)</option>
              <option value="*">All Company Members</option>
              <optgroup label="Specific Roles">
                {roles.map((r) => (
                  <option key={r.id} value={`role:${r.id}`}>
                    Role: {r.name}
                  </option>
                ))}
              </optgroup>
              {departments.length > 0 && (
                <optgroup label="Departments">
                  {departments.map((d) => (
                    <option key={d.id} value={`department:${d.id}`}>
                      Dept: {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* 4. Action Buttons */}
      <div className="flex justify-end gap-2.5 pt-2 border-t border-line">
        {onCancel && (
          <Button type="button" kind="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy || !selectedFile}>
          {busy
            ? "Ingesting..."
            : uploadType === "pdf"
            ? "Upload PDF"
            : "Upload Records"}
        </Button>
      </div>
    </form>
  );
}
