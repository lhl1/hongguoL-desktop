export interface ProducerState {exists:boolean;finished:boolean;decodedSeconds:number}
export function shouldPreloadNext(video:HTMLVideoElement|null|undefined,remaining:number,producer:ProducerState|undefined,seamless:boolean,aggressive?:boolean):boolean;
export function readyForHandoff(video:HTMLVideoElement|null|undefined):boolean;
export function startFrameHandoff(video:HTMLVideoElement,options:{valid:()=>boolean;ready:()=>void;failed:()=>void;timeout?:number}):{cancel:()=>void};
