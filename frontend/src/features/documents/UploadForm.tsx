import { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  Database,
  FileSpreadsheet,
  CheckCircle2,
  X,
  Trash2,
  Plus,
  AlertCircle,
  Check,
  RefreshCw,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { api } from "../../lib/api";
import { LEVELS, type Department, type Role } from "../../lib/types";

interface SelectedFileItem {
  id: string;
  file: File;
  title: string;
  type: "pdf" | "database";
  status: "idle" | "uploading" | "done" | "error";
  errorMsg?: string;
}

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
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [classification, setClassification] = useState(1);
  const [initialGrant, setInitialGrant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState("");

  const acceptedExtensions = ".pdf,.csv,.tsv,.json,.sql";

  const getCleanTitle = (fileName: string) => {
    return fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const addFiles = (files: FileList | File[]) => {
    setError("");
    const newItems: SelectedFileItem[] = [];
    const validExts = [".pdf", ".csv", ".tsv", ".json", ".sql"];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!validExts.includes(ext)) {
        setError(`"${file.name}" has an unsupported format. Allowed: .pdf, .csv, .tsv, .json, .sql`);
        continue;
      }
      // Avoid duplicate files already in list
      if (selectedFiles.some((f) => f.file.name === file.name && f.file.size === file.size)) {
        continue;
      }

      const fileType = ext === ".pdf" ? "pdf" : "database";
      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        title: getCleanTitle(file.name),
        type: fileType,
        status: "idle",
      });
    }

    if (newItems.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    if (busy) return;
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateTitle = (id: string, newTitle: string) => {
    setSelectedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, title: newTitle } : f))
    );
  };

  async function uploadAll(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setError("Please select at least one document to upload.");
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

    setBusy(true);
    setError("");

    let successCount = 0;
    const totalCount = selectedFiles.length;

    for (let i = 0; i < selectedFiles.length; i++) {
      const item = selectedFiles[i];
      setUploadProgressText(`Uploading and ingesting file ${i + 1} of ${totalCount}: ${item.file.name}...`);

      setSelectedFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "uploading" } : f))
      );

      const form = new FormData();
      form.append("file", item.file);
      form.append("title", item.title.trim() || item.file.name);
      form.append("classification", String(classification));
      form.append("grants", JSON.stringify(grants));

      try {
        const endpoint = item.type === "pdf" ? "/documents/upload" : "/documents/upload-database";
        await api(endpoint, { method: "POST", body: form });

        setSelectedFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "done" } : f))
        );
        successCount++;
      } catch (err) {
        const msg = (err as Error).message || "Upload failed";
        setSelectedFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "error", errorMsg: msg } : f))
        );
      }
    }

    setBusy(false);
    setUploadProgressText("");

    if (successCount === totalCount) {
      setSelectedFiles([]);
      onDone();
    } else if (successCount > 0) {
      setError(`Uploaded ${successCount} of ${totalCount} documents. Some files encountered errors.`);
      onDone();
    } else {
      setError("Failed to upload selected documents. Please check file formats and try again.");
    }
  }

  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.file.size, 0);
  const totalSizeMb = (totalBytes / (1024 * 1024)).toFixed(2);

  return (
    <form onSubmit={uploadAll} className="space-y-5">
      {/* 1. Drag & Drop Multiple File Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
          isDragOver
            ? "border-indigo-600 bg-indigo-50/50 scale-[0.99]"
            : selectedFiles.length > 0
            ? "border-indigo-200 bg-indigo-50/20 hover:border-indigo-400"
            : "border-slate-200 bg-slate-50/50 hover:border-indigo-400 hover:bg-slate-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedExtensions}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-2xs mb-2">
          <UploadCloud className="h-6 w-6" />
        </div>

        <p className="text-sm font-semibold text-slate-900">
          Click to select or drag & drop <span className="text-indigo-600">multiple files</span>
        </p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Select multiple PDF documents or Database records (.csv, .tsv, .json, .sql). Up to 25MB per file.
        </p>

        {selectedFiles.length > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-100/70 px-3 py-1 text-xs font-semibold text-indigo-800">
            <Plus className="h-3.5 w-3.5" />
            <span>Click or drag more files to add to batch</span>
          </div>
        )}
      </div>

      {/* 2. Selected Files Queue List */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">
              Selected Documents ({selectedFiles.length}) • {totalSizeMb} MB total
            </h4>
            {!busy && (
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                className="text-xs text-rose-600 hover:text-rose-700 hover:underline font-medium"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {selectedFiles.map((item, idx) => {
              const isPdf = item.type === "pdf";
              const sizeKb = (item.file.size / 1024).toFixed(1);

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
                    item.status === "done"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : item.status === "error"
                      ? "border-rose-200 bg-rose-50/50"
                      : item.status === "uploading"
                      ? "border-indigo-300 bg-indigo-50/40 animate-pulse"
                      : "border-slate-200 bg-white shadow-2xs"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                        isPdf
                          ? "bg-rose-50 text-rose-600 border-rose-100"
                          : "bg-emerald-50 text-emerald-600 border-emerald-100"
                      }`}
                    >
                      {isPdf ? <FileText className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => updateTitle(item.id, e.target.value)}
                          disabled={busy}
                          placeholder="Document title"
                          className="w-full text-xs font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition-colors truncate"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-[0.7rem] text-slate-500 font-mono">
                        <span className="truncate max-w-[180px]">{item.file.name}</span>
                        <span>•</span>
                        <span>{sizeKb} KB</span>
                        <span>•</span>
                        <span className="uppercase font-semibold text-slate-600">{item.type}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator or Remove Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "uploading" && (
                      <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
                    )}
                    {item.status === "done" && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                    {item.status === "error" && (
                      <span className="flex items-center gap-1 text-[0.7rem] text-rose-600 font-medium">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Failed</span>
                      </span>
                    )}
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="rounded-lg p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors"
                        title="Remove file"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Batch Permissions & Classification Settings */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">
          Batch Access Rules (Applies to all selected files)
        </h4>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">
              Classification Tier
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              value={classification}
              onChange={(e) => setClassification(Number(e.target.value))}
              disabled={busy}
            >
              {LEVELS.map((label, i) => (
                <option key={label} value={i}>
                  Level {i} — {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">
              Access Scope
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              value={initialGrant}
              onChange={(e) => setInitialGrant(e.target.value)}
              disabled={busy}
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

      {uploadProgressText && (
        <div className="flex items-center gap-2 text-xs text-indigo-700 font-medium bg-indigo-50 p-3 rounded-lg border border-indigo-100">
          <RefreshCw className="h-4 w-4 animate-spin text-indigo-600 shrink-0" />
          <span>{uploadProgressText}</span>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {/* 4. Action Buttons */}
      <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
        {onCancel && (
          <Button type="button" kind="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={busy || selectedFiles.length === 0}
          className="flex items-center gap-2"
        >
          {busy ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Ingesting Files...</span>
            </>
          ) : (
            <span>
              {selectedFiles.length > 1
                ? `Upload ${selectedFiles.length} Documents`
                : selectedFiles.length === 1
                ? "Upload 1 Document"
                : "Select Documents to Upload"}
            </span>
          )}
        </Button>
      </div>
    </form>
  );
}
