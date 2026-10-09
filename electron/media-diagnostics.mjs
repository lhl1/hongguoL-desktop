// Return only a fixed classification. Never persist a substring of decoder stderr.
export function decoderFailure(text='',errorCode='',signal=''){
 if(['ENOENT','EACCES','ENOEXEC'].includes(errorCode)||signal==='SIGKILL'||/dyld|code sign|operation not permitted|permission denied/i.test(text))return'M101';
 if(/protocol.*not|option.*not found|unrecognized option/i.test(text))return'M105';
 if(/certificate|tls|ssl|server returned|connection|network|http error|failed to resolve/i.test(text))return'M102';
 if(/unknown encoder|error.*encoder|libx264.*failed|unsupported.*pixel/i.test(text))return'M103';
 if(/decryption|encryption|invalid data|moov atom|error.*decod|corrupt/i.test(text))return'M104';
 return'M199';
}
export const decoderMessage=code=>({M101:'Mac 解码器未能启动，请重新运行准备Mac版',M102:'解码器连接视频服务失败',M103:'解码器无法输出兼容视频',M104:'视频解码失败',M105:'解码器参数或协议不兼容',M106:'解码器启动超时',M199:'解码器异常退出'}[code]||'Mac 播放器无法读取视频流');
