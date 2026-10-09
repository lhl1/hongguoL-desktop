package local.research;
import com.github.unidbg.linux.android.dvm.*;
import com.github.unidbg.linux.android.dvm.wrapper.DvmBoolean;
import com.github.unidbg.linux.android.dvm.wrapper.DvmLong;
/** Runtime JNI callbacks only; no research entry point or captured device state. */
public class MetaSecProbe extends AbstractJni {
  @Override public long callLongMethodV(BaseVM vm,DvmObject<?> obj,String signature,VaList args) {
    if(signature.equals("java/lang/Long->longValue()J"))return ((Number)obj.getValue()).longValue();
    return super.callLongMethodV(vm,obj,signature,args);
  }
  @Override public DvmObject<?> callStaticObjectMethodV(BaseVM vm,DvmClass cls,String signature,VaList args) {
    if(signature.equals("java/lang/Boolean->valueOf(Z)Ljava/lang/Boolean;"))return DvmBoolean.valueOf(vm,args.getIntArg(0)!=0);
    if(signature.equals("java/lang/Long->valueOf(J)Ljava/lang/Long;"))return DvmLong.valueOf(vm,args.getLongArg(0));
    if(signature.endsWith("->b(IIJLjava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;")) {
      int code=args.getIntArg(0);
      if(code==268435470 || code==268435471)return DvmLong.valueOf(vm,0L);
      if(code==33554433 || code==33554434)return DvmBoolean.valueOf(vm,true);
      return null;
    }
    return super.callStaticObjectMethodV(vm,cls,signature,args);
  }
}
