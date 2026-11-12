import type {Detail,Playback} from './types';
export interface TimelineItem {detail:Detail;play:Playback}
export interface TimelineChapter {item:TimelineItem;start:number;end:number;complete:boolean}
export interface MediaTimeline {url:string;locate:(time:number)=>TimelineChapter|undefined;status:()=>{closed:boolean;suspended:boolean;reading:boolean;chapters:{start:number;end:number;complete:boolean;episode:number}[];clock:number};update:(time:number)=>void;setAutoNext:(value:boolean)=>void;suspend:()=>void;destroy:()=>void}
export const TIMELINE_MIME:string;
export function createMediaTimeline(options:{first:TimelineItem;getNext:(previous:TimelineItem)=>Promise<TimelineItem|undefined>;onChapter?:(chapter:TimelineChapter)=>void;onError?:(error:Error)=>void;onItemDone?:(item:TimelineItem)=>void;autoNext?:boolean;aggressive?:boolean}):MediaTimeline;
