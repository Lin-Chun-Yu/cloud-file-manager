/**
 * ============================================================
 * 雲端檔案管理系統 — Domain Model & 核心邏輯實作
 * ============================================================
 *
 * 設計模式：
 *  - Composite Pattern：FileSystemComponent（Component）
 *      └ File 系列（Leaf：WordFile / ImageFile / TextFile）
 *      └ Directory（Composite）
 *  - Command Pattern：支援刪除 / 貼上 / 標籤操作的 Undo / Redo
 *
 * 對應訪談需求：
 *  - 所有檔案都有：檔名、大小(KB)、建立時間 -> FileSystemComponent 共同屬性
 *  - Word 檔 -> 頁數；圖片 -> 解析度(寬高)；純文字檔 -> 編碼
 *  - 目錄可包含檔案與子目錄（可無限層套疊）-> Directory.children: FileSystemComponent[]
 *  - 檔案必須存在於目錄底下（不可孤立存在）-> 系統中所有節點皆透過 Directory.add() 掛載，
 *    File 本身不提供獨立於 Directory 之外的呈現方式
 * ============================================================
 */

// ------------------------------------------------------------
// 工具函式
// ------------------------------------------------------------

/** 將 bytes 轉為人類可讀格式 (B / KB / MB)，對應範例："500KB"、"2MB"、"500B" */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${Number.isInteger(kb) ? kb : kb.toFixed(1)}KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
}

/** 將節點名稱轉換成 XML 標籤（去除空白/括號/句點，符合客戶提供的預期格式） */
function toXmlTag(name: string): string {
  return name
    .replace(/\s*\(/g, "_")
    .replace(/\)/g, "")
    .replace(/\./g, "_")
    .replace(/\s+/g, "_");
}

type SortField = "name" | "size" | "extension";
type SortOrder = "asc" | "desc";
type TagColor = "Red" | "Blue" | "Green";

interface Tag {
  name: string;
  color: TagColor;
}

// ------------------------------------------------------------
// 1. Component - 基底類別
// ------------------------------------------------------------
abstract class FileSystemComponent {
  protected name: string;
  protected createdAt: Date;
  protected tags: Tag[] = [];

  constructor(name: string, createdAt: Date = new Date()) {
    this.name = name;
    this.createdAt = createdAt;
  }

  getName(): string {
    return this.name;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  /** 副檔名；目錄無副檔名，回傳空字串（供排序共用邏輯） */
  getExtension(): string {
    return "";
  }

  addTag(tag: Tag): void {
    if (!this.tags.some((t) => t.name === tag.name)) this.tags.push(tag);
  }

  removeTag(tagName: string): void {
    this.tags = this.tags.filter((t) => t.name !== tagName);
  }

  getTags(): Tag[] {
    return [...this.tags];
  }

  protected tagBadge(): string {
    if (this.tags.length === 0) return "";
    return " " + this.tags.map((t) => `[${t.name}:${t.color}]`).join("");
  }

  /** 靜默計算大小 (bytes)，不印出遍歷紀錄，供內部顯示 / 排序使用 */
  abstract getSize(): number;

  /** 印出目錄樹狀結構（功能一） */
  abstract display(indent?: string): void;

  /** 輸出 XML 結構（功能二-3） */
  abstract toXML(indent?: string): string;

  /** 遞迴計算總容量，並印出 Visiting 遍歷紀錄（功能二-1 + 功能三） */
  abstract calculateTotalSize(pathSoFar?: string[]): number;

  /** 依副檔名搜尋，並印出 Visiting 遍歷紀錄（功能二-2 + 功能三） */
  abstract searchByExtension(
    ext: string,
    pathSoFar?: string[],
    results?: string[]
  ): string[];

  /** 深層複製節點（供複製/貼上使用） */
  abstract clone(): FileSystemComponent;

  // Composite 專屬操作；Leaf（File）節點呼叫時丟出例外
  add(_component: FileSystemComponent): void {
    throw new Error(`${this.name} 是檔案，無法新增子節點`);
  }

  remove(_component: FileSystemComponent): void {
    throw new Error(`${this.name} 是檔案，無法移除子節點`);
  }

  getChildren(): FileSystemComponent[] {
    throw new Error(`${this.name} 是檔案，沒有子節點`);
  }

  sort(_by: SortField, _order?: SortOrder): void {
    throw new Error(`${this.name} 是檔案，無法排序`);
  }
}

// ------------------------------------------------------------
// 2. Leaf - File 抽象基礎類別與三個子類別
// ------------------------------------------------------------
abstract class BaseFile extends FileSystemComponent {
  protected sizeInBytes: number;

  constructor(name: string, sizeInBytes: number, createdAt?: Date) {
    super(name, createdAt);
    this.sizeInBytes = sizeInBytes;
  }

  getSize(): number {
    return this.sizeInBytes;
  }

  /** 各子類別提供自己專屬的詳細資訊字串，例如 "頁數: 15, 大小: 500KB" */
  abstract getDetail(): string;

  display(indent: string = ""): void {
    console.log(`${indent}📄 ${this.name} (${this.getDetail()})${this.tagBadge()}`);
  }

  toXML(indent: string = ""): string {
    return `${indent}<${toXmlTag(this.name)}>${this.getDetail()}</${toXmlTag(
      this.name
    )}>\n`;
  }

  calculateTotalSize(pathSoFar: string[] = []): number {
    const fullPath = [...pathSoFar, this.name];
    console.log(`Visiting: ${fullPath.join(" -> ")}`);
    return this.getSize();
  }

  searchByExtension(
    ext: string,
    pathSoFar: string[] = [],
    results: string[] = []
  ): string[] {
    const fullPath = [...pathSoFar, this.name];
    console.log(`Visiting: ${fullPath.join(" -> ")}`);
    const normalizedExt = ext.replace(/^\./, "").toLowerCase();
    if (this.getExtension().toLowerCase() === normalizedExt) {
      results.push(fullPath.join("/"));
    }
    return results;
  }
}

class WordFile extends BaseFile {
  private pageCount: number;

  constructor(name: string, sizeInBytes: number, pageCount: number, createdAt?: Date) {
    super(name, sizeInBytes, createdAt);
    this.pageCount = pageCount;
  }

  getExtension(): string {
    return "docx";
  }

  getDetail(): string {
    return `頁數: ${this.pageCount}, 大小: ${formatBytes(this.sizeInBytes)}`;
  }

  clone(): WordFile {
    const copy = new WordFile(this.name, this.sizeInBytes, this.pageCount);
    copy.tags = [...this.tags];
    return copy;
  }
}

class ImageFile extends BaseFile {
  private width: number;
  private height: number;

  constructor(
    name: string,
    sizeInBytes: number,
    width: number,
    height: number,
    createdAt?: Date
  ) {
    super(name, sizeInBytes, createdAt);
    this.width = width;
    this.height = height;
  }

  getExtension(): string {
    const parts = this.name.split(".");
    // 請改成這樣：
    return parts.length > 1 ? parts[parts.length - 1]! : "";
  }

  getDetail(): string {
    return `解析度: ${this.width}x${this.height}, 大小: ${formatBytes(
      this.sizeInBytes
    )}`;
  }

  clone(): ImageFile {
    const copy = new ImageFile(this.name, this.sizeInBytes, this.width, this.height);
    copy.tags = [...this.tags];
    return copy;
  }
}

class TextFile extends BaseFile {
  private encoding: string;

  constructor(name: string, sizeInBytes: number, encoding: string, createdAt?: Date) {
    super(name, sizeInBytes, createdAt);
    this.encoding = encoding;
  }

  getExtension(): string {
    return "txt";
  }

  getDetail(): string {
    return `編碼: ${this.encoding}, 大小: ${formatBytes(this.sizeInBytes)}`;
  }

  clone(): TextFile {
    const copy = new TextFile(this.name, this.sizeInBytes, this.encoding);
    copy.tags = [...this.tags];
    return copy;
  }
}

// ------------------------------------------------------------
// 3. Composite - Directory
// ------------------------------------------------------------
class Directory extends FileSystemComponent {
  private children: FileSystemComponent[] = [];

  constructor(name: string, createdAt?: Date) {
    super(name, createdAt);
  }

  add(component: FileSystemComponent): void {
    this.children.push(component);
  }

  remove(component: FileSystemComponent): void {
    this.children = this.children.filter((c) => c !== component);
  }

  getChildren(): FileSystemComponent[] {
    return this.children;
  }

  getSize(): number {
    return this.children.reduce((sum, c) => sum + c.getSize(), 0);
  }

  display(indent: string = ""): void {
    console.log(
      `${indent}📁 ${this.name}/ (共 ${formatBytes(this.getSize())})${this.tagBadge()}`
    );
    for (const child of this.children) {
      child.display(indent + "    ");
    }
  }

  toXML(indent: string = ""): string {
    const tag = toXmlTag(this.name);
    let xml = `${indent}<${tag}>\n`;
    for (const child of this.children) {
      xml += child.toXML(indent + "  ");
    }
    xml += `${indent}</${tag}>\n`;
    return xml;
  }

  calculateTotalSize(pathSoFar: string[] = []): number {
    const fullPath = [...pathSoFar, this.name];
    console.log(`Visiting: ${fullPath.join(" -> ")}`);
    let total = 0;
    for (const child of this.children) {
      total += child.calculateTotalSize(fullPath);
    }
    return total;
  }

  searchByExtension(
    ext: string,
    pathSoFar: string[] = [],
    results: string[] = []
  ): string[] {
    const fullPath = [...pathSoFar, this.name];
    console.log(`Visiting: ${fullPath.join(" -> ")}`);
    for (const child of this.children) {
      child.searchByExtension(ext, fullPath, results);
    }
    return results;
  }

  clone(): Directory {
    const copy = new Directory(`${this.name}_copy`);
    copy.tags = [...this.tags];
    for (const child of this.children) {
      copy.add(child.clone());
    }
    return copy;
  }

  sort(by: SortField, order: SortOrder = "asc"): void {
    const factor = order === "asc" ? 1 : -1;
    this.children.sort((a, b) => {
      if (by === "name") return a.getName().localeCompare(b.getName()) * factor;
      if (by === "size") return (a.getSize() - b.getSize()) * factor;
      return a.getExtension().localeCompare(b.getExtension()) * factor;
    });
  }

  /** 依名稱在直接子節點中尋找（供 demo 操作使用） */
  findChildByName(name: string): FileSystemComponent | undefined {
    return this.children.find((c) => c.getName() === name);
  }
}

// ------------------------------------------------------------
// 4. Command Pattern - Undo / Redo（進階功能）
// ------------------------------------------------------------
interface Command {
  description: string;
  execute(): void;
  undo(): void;
}

class RemoveCommand implements Command {
  description: string;
  constructor(private parent: Directory, private target: FileSystemComponent) {
    this.description = `刪除 "${target.getName()}"`;
  }
  execute(): void {
    this.parent.remove(this.target);
  }
  undo(): void {
    this.parent.add(this.target);
  }
}

class PasteCommand implements Command {
  description: string;
  private pastedNode: FileSystemComponent;
  constructor(private target: Directory, sourceNode: FileSystemComponent) {
    this.pastedNode = sourceNode.clone();
    this.description = `貼上 "${this.pastedNode.getName()}" 至 "${target.getName()}"`;
  }
  execute(): void {
    this.target.add(this.pastedNode);
  }
  undo(): void {
    this.target.remove(this.pastedNode);
  }
}

class AddTagCommand implements Command {
  description: string;
  constructor(private node: FileSystemComponent, private tag: Tag) {
    this.description = `為 "${node.getName()}" 加上標籤 [${tag.name}]`;
  }
  execute(): void {
    this.node.addTag(this.tag);
  }
  undo(): void {
    this.node.removeTag(this.tag.name);
  }
}

class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  execute(cmd: Command): void {
    cmd.execute();
    this.undoStack.push(cmd);
    this.redoStack = []; // 新操作後清空 redo 堆疊
    console.log(`[執行] ${cmd.description}`);
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) {
      console.log("[Undo] 沒有可復原的操作");
      return;
    }
    cmd.undo();
    this.redoStack.push(cmd);
    console.log(`[Undo] 已復原：${cmd.description}`);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) {
      console.log("[Redo] 沒有可重做的操作");
      return;
    }
    cmd.execute();
    this.undoStack.push(cmd);
    console.log(`[Redo] 已重做：${cmd.description}`);
  }
}

// ============================================================
// 5. Demo - 依「客戶提供的範例結構圖」建立物件並驗證所有功能
// ============================================================
function section(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

function main(): void {
  // ---------- 初始化（依範例結構圖建立物件實例） ----------
  const root = new Directory("根目錄 (Root)");

  const projectDocs = new Directory("專案文件 (Project_Docs)");
  projectDocs.add(new WordFile("需求規格書.docx", 500 * 1024, 15));
  projectDocs.add(new ImageFile("系統架構圖.png", 2 * 1024 * 1024, 1920, 1080));

  const personalNotes = new Directory("個人筆記 (Personal_Notes)");
  personalNotes.add(new TextFile("待辦清單.txt", 1 * 1024, "UTF-8"));

  const archive2025 = new Directory("2025備份 (Archive_2025)");
  archive2025.add(new WordFile("舊會議記錄.docx", 200 * 1024, 5));
  personalNotes.add(archive2025);

  root.add(projectDocs);
  root.add(personalNotes);
  root.add(new TextFile("README.txt", 500, "ASCII"));

  // ---------- 功能一：目錄結構呈現 ----------
  section("功能一：目錄結構呈現");
  root.display();

  // ---------- 功能二-1：遞迴計算總容量（含功能三遍歷紀錄） ----------
  section("功能二-1：遞迴計算總容量（Root）");
  const totalSize = root.calculateTotalSize();
  console.log(`\n>> 總容量：${formatBytes(totalSize)}`);

  section("功能二-1：遞迴計算總容量（個人筆記子目錄）");
  const notesSize = personalNotes.calculateTotalSize();
  console.log(`\n>> 個人筆記總容量：${formatBytes(notesSize)}`);

  // ---------- 功能二-2：副檔名搜尋（含功能三遍歷紀錄） ----------
  section("功能二-2：副檔名搜尋 (.docx)");
  const docxResults = root.searchByExtension(".docx");
  console.log("\n>> 搜尋結果：");
  docxResults.forEach((p) => console.log("   - " + p));

  // ---------- 功能二-3：XML 結構輸出 ----------
  section("功能二-3：XML 結構輸出");
  console.log(root.toXML());

  // ---------- 功能四：進階功能 ----------
  section("功能四-1：排序（依大小，降冪）");
  root.sort("size", "desc");
  root.display();

  section("功能四-3：標籤功能（多重標籤）");
  const history = new HistoryManager();
  const readme = root.findChildByName("README.txt")!;
  history.execute(new AddTagCommand(readme, { name: "Urgent", color: "Red" }));
  history.execute(new AddTagCommand(readme, { name: "Work", color: "Blue" }));
  root.display();

  section("功能四-2：編輯功能（刪除 + Undo / Redo）");
  const removeCmd = new RemoveCommand(root, readme);
  history.execute(removeCmd);
  console.log("\n>> 刪除後：");
  root.display();

  history.undo();
  console.log("\n>> Undo 後（README.txt 應恢復）：");
  root.display();

  history.redo();
  console.log("\n>> Redo 後（README.txt 應再次消失）：");
  root.display();

  section("功能四-2：編輯功能（複製 / 貼上）");
  const pasteCmd = new PasteCommand(personalNotes, projectDocs);
  history.execute(pasteCmd);
  console.log("\n>> 貼上後（Personal_Notes 底下應多一份 Project_Docs 副本）：");
  root.display();

  history.undo();
  console.log("\n>> Undo 貼上後：");
  root.display();
}

main();
