export function isCurrentMediaError(slot,entry,pending,renderedSerial,source,error){
 return !!error&&!!entry&&!!pending&&pending.slot===slot&&pending.serial===entry.serial&&renderedSerial===entry.serial&&source===entry.play.url;
}
