// A wheel/trackpad burst is one gesture, irrespective of the number of events.
export function createWheelGate({quiet=220,cooldown=700,threshold=28}={}){
 let last=-Infinity,accepted=-Infinity,total=0;
 return (delta,now,blocked=false)=>{
  if(!Number.isFinite(delta)||delta===0)return 0;
  if(now-last>quiet)total=0;
  const fresh=now-last>quiet;last=now;
  if(blocked){accepted=now;total=0;return 0;}
  if(!fresh&&total===Infinity)return 0;
  if(now-accepted<cooldown)return 0;
  total+=delta;if(Math.abs(total)<threshold)return 0;
  const direction=Math.sign(total);total=Infinity;accepted=now;return direction;
 };
}
