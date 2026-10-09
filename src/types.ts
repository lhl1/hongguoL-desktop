export interface Series { id: string; title: string; cover: string; intro: string; episodes: number; episodeText: string; tags: string[]; familyId?: string; season?: number; availability?:'upcoming'|'unavailable'; metric?:string; openId?:string }
export interface SeriesFamily {id:string;title:string;items:Series[];total:number}
export interface Detail extends Series { accessible: number; videoIds: string[]; episodeList: {number: number; videoId: string; locked: boolean}[]; videoPlatform: number; contentType?:number; rating: string; favoriteText: string }
export interface Progress extends Series { episode: number; seconds: number; updatedAt: number }
export interface Library { version: number; favorites: Series[]; history: Progress[] }
export interface Home { fetchedAt: number; sections: {key: string; title: string; items: Series[]}[]; banners: Series[] }
export interface Search { query: string; items: Series[]; total: number; hasMore:boolean;cursor:string }
export interface Playback { seriesId: string; episode: number; videoId: string; url: string; poster: string; duration: number; width: number; height: number; quality: string; qualities:{id:string;label:string}[]; fetchedAt: number; startSeconds?: number; localDecoded?: boolean }
export interface FilterRow {title:string;type?:string;selectionType?:number;limit?:number;refreshOthers?:boolean;items:FilterItem[]}
export interface FilterItem {id:string;title:string;selected:boolean;children:FilterItem[];filters:FilterRow[];background?:FilterRow[];description?:string;exclusive?:boolean;rows?:FilterRow[]}
export interface Actor {id:string;name:string;cover:string;intro:string;tags:string[];metric:string}
export interface Page {items:Series[];hasMore:boolean;cursor:string;filters:FilterItem[];actors?:Actor[];rows?:FilterRow[];order?:FilterRow[];categoryTabs?:{id:number;title:string;selected:boolean}[];categoryType?:number;filterContext?:string;selectedFilters?:Record<string,string[]>;maxExpand?:number}
export interface WindowState {mode:'normal'|'window';fullscreen:boolean;maximized:boolean}
export type Result<T> = {ok: true; data: T} | {ok: false; error: string};
export interface Preferences { theme: 'system'|'light'|'dark'; resolvedTheme: 'light'|'dark'; homeAutoplay: boolean; autoplay: boolean; defaultSpeed: number; autoNext: boolean; defaultMode: 'normal'|'window'; volume: number; defaultQuality:string; previewBeforePlay:boolean; defaultCatalogLayout:'grid'|'list' }
export interface Account { loggedIn: boolean; user: {userId: string; name: string}|null; retryAt: number; sync: {state: string; at: number; message?: string; downloaded?: number; uploaded?: number} }
export interface API {
  readonly platform: string;
  home(category?: string): Promise<Result<Home>>; search(query: string,cursor?:string): Promise<Result<Search>>;
  suggest(query:string):Promise<Result<{query:string;items:string[]}>>;
  family(id:string):Promise<Result<SeriesFamily|null>>;
  seriesGroups(ids:string[]):Promise<Result<{families:SeriesFamily[];unavailable:number}>>;
  detail(id: string): Promise<Result<Detail>>; playback(id: string, episode: number, startSeconds?: number, quality?:string): Promise<Result<Playback>>;
  feed(category?:string,cursor?:string):Promise<Result<Page>>;rankings(selection?:Record<string,string>,cursor?:string):Promise<Result<Page>>;
  filterCatalog(selection?:{context?:string;selectItems?:Record<string,string[]>},cursor?:string):Promise<Result<Page>>;
  actorWorks(id:string,cursor?:string):Promise<Result<Page>>;
  mediaDiagnostics():Promise<Result<{message:string;last?:{code?:string}}>>;
  exportLogs():Promise<Result<{canceled:boolean;filename?:string}>>;
  logVideo(value:{event:string;error?:number;ready?:number;network?:number;width?:number;height?:number;seconds?:number}):Promise<Result<void>>;
  release(url:string):Promise<Result<void>>;windowControl(action:string):Promise<Result<WindowState>>;onWindow(callback:(v:WindowState)=>void):()=>void;
  library(): Promise<Result<Library>>; favorite(item: Series): Promise<Result<Library>>;
  progress(item: Series & {episode: number; seconds: number}): Promise<Result<Library>>;
  clearHistory(): Promise<Result<Library>>; status(): Promise<Result<{source: string; runtime: string; onlineVerified: boolean; pending: string[]}>>;
  preferences(): Promise<Result<Preferences>>; savePreferences(value: Partial<Preferences>): Promise<Result<Preferences>>;
  account(): Promise<Result<Account>>; sendCode(phone: string): Promise<Result<Account>>; login(phone: string, code: string): Promise<Result<Account>>; logout(): Promise<Result<Account>>; sync(): Promise<Result<{account: Account; library: Library}>>;
  onPreferences(callback: (value: Preferences) => void): () => void; onSync(callback: (value: Result<{account: Account; library: Library}>) => void): () => void;
}
declare global { interface Window { hongguo: API } }
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> { const result = await promise; if (!result.ok) throw new Error(result.error); return result.data; }
