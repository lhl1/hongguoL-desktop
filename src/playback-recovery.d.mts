import type {Playback} from './types';
export const PAUSE_RELEASE_MS:number;
export const WAIT_RECOVERY_MS:number;
export function stalePlayback(play:Playback,released?:boolean,now?:number):boolean;
export function currentPlaybackEvent(slot:number,entry:{serial:number;play:Playback;source?:string}|undefined,renderedSerial:number|undefined,source:string|null):boolean;
export function createRecoveryBudget(maximum?:number):{take:()=>boolean;reset:()=>void;count:()=>number;progress:(seconds:number)=>void};
export function bufferedAhead(video:HTMLVideoElement|null|undefined):number;
export function canPrefetch(video:HTMLVideoElement|null|undefined,remaining:number,aggressive?:boolean):boolean;
export function createPlaybackWatchdog():{observe:(value:{source:number|undefined;seconds:number;playing:boolean;held:boolean;ended:boolean;aggressive:boolean},now?:number)=>boolean};
