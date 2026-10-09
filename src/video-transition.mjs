// Keep the outgoing frame in motion; never duplicate it as the incoming video.
export function animateFrames(previous,next,direction,reducedMotion=false){
 if(reducedMotion||!direction)return{finished:Promise.resolve(),ready(){},cancel(){}};
 const sign=direction>0?1:-1,options={duration:620,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'};
 const outgoing=previous.animate([{transform:'translateY(0)',opacity:1},{transform:`translateY(${-sign*100}%)`,opacity:1}],options);
 const incoming=next.animate([{transform:`translateY(${sign*100}%)`,opacity:1},{transform:'translateY(0)',opacity:1}],options);
 // Decoding never controls the animation clock. The incoming frame may remain
 // empty after the turn, and becomes visible naturally when its first frame arrives.
 const finished=Promise.allSettled([outgoing.finished,incoming.finished]);
 return{finished,ready(){},cancel(){outgoing.cancel();incoming.cancel();}};
}
