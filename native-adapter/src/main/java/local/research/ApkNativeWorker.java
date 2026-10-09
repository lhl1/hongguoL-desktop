package local.research;
import com.github.unidbg.AndroidEmulator;
import com.github.unidbg.linux.android.AndroidEmulatorBuilder;
import com.github.unidbg.linux.android.AndroidResolver;
import com.github.unidbg.arm.backend.Unicorn2Factory;
import com.github.unidbg.linux.android.dvm.*;
import com.github.unidbg.linux.android.dvm.array.ByteArray;
import java.io.*;
import java.nio.file.*;
import java.net.URI;
import java.util.*;
import com.alibaba.fastjson.*;
/** One Windows process, native ARM/JNI ABI adapter only, no Android OS or ADB. */
public final class ApkNativeWorker extends MetaSecProbe {
  static final String METHOD="a(IIJLjava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;";
  final AndroidEmulator emulator;
  final VM vm;
  final DvmClass bridge;
  final JSONArray baseConfig;
  long handle;
  String currentGuest;
  ApkNativeWorker(File resources) throws Exception {
    emulator=AndroidEmulatorBuilder.for64Bit().setProcessName("com.phoenix.read").addBackendFactory(new Unicorn2Factory(true)).build();
    emulator.getMemory().setLibraryResolver(new AndroidResolver(23));vm=emulator.createDalvikVM();vm.setJni(this);vm.setVerbose(false);
    vm.resolveClass("com/bytedance/mobsec/metasec/ml/MS",vm.resolveClass("ms/bd/c/q2",vm.resolveClass("ms/bd/c/k3")));
    new com.github.unidbg.virtualmodule.android.AndroidModule(emulator,vm).register(emulator.getMemory());
    vm.loadLibrary(new File(resources,"libmetasec_ml.so"),true).callJNI_OnLoad(emulator);
    vm.loadLibrary(new File(resources,"libEncryptor.so"),true).callJNI_OnLoad(emulator);
    bridge=vm.resolveClass("ms/bd/c/k3");
    bridge.callStaticJniMethodObject(emulator,METHOD,16777219,0,0L,null,vm.resolveClass("android/app/Application",vm.resolveClass("android/content/Context")).newObject(null));
    baseConfig=JSON.parseArray(Files.readString(new File(resources,"msconfig.json").toPath()));
  }
  JSONObject dispatch(JSONObject request) throws Exception {
    JSONObject result=new JSONObject();String operation=request.getString("operation");
    if(operation.equals("encrypt")) {
      byte[] bytes=Base64.getDecoder().decode(request.getString("body"));
      if(bytes.length>1024*1024)throw new IllegalArgumentException("Body too large");
      DvmObject<?> encrypted=vm.resolveClass("com/bytedance/frameworks/encryptor/EncryptorUtil").callStaticJniMethodObject(emulator,"ttEncrypt([BI)[B",new ByteArray(vm,bytes),bytes.length);
      if(encrypted==null)throw new IllegalStateException("No encrypted body");result.put("body",Base64.getEncoder().encodeToString((byte[])encrypted.getValue()));
      return result;
    }
    if(!operation.equals("sign"))throw new IllegalArgumentException("Unsupported operation");
    String url=request.getString("url");URI uri=URI.create(url);
    boolean passport="security.snssdk.com".equals(uri.getHost()) && Set.of("/passport/mobile/send_code/v1/","/passport/mobile/sms_login/","/passport/account/info/v2/").contains(uri.getPath());
    if(!"https".equals(uri.getScheme()) || !(passport || Set.of("reading.snssdk.com","api5-normal-sinfonlinec.fqnovel.com").contains(uri.getHost())))throw new IllegalArgumentException("Unknown APK host");
    JSONObject guest=request.getJSONObject("guest");String guestKey=guest.getString("device_id")+":"+guest.getString("iid");
    if(!guestKey.equals(currentGuest)) {
      if(currentGuest!=null)throw new IllegalStateException("Guest context changed; restart worker");
      JSONArray config=JSON.parseArray(baseConfig.toJSONString());config.set(6,guest.getString("device_id"));config.set(8,guest.getString("iid"));
      DvmObject<?> init=bridge.callStaticJniMethodObject(emulator,METHOD,67108865,0,0L,new StringObject(vm,config.toJSONString()),null);
      if(init==null || !Boolean.TRUE.equals(init.getValue()))throw new IllegalStateException("Native initialization failed");
      DvmObject<?> value=bridge.callStaticJniMethodObject(emulator,METHOD,67108866,0,0L,null,null);
      handle=((Number)value.getValue()).longValue();currentGuest=guestKey;
    }
    byte[] body=request.containsKey("body")?Base64.getDecoder().decode(request.getString("body")):null;
    DvmObject<?> signed=bridge.callStaticJniMethodObject(emulator,METHOD,33554438,0,handle,new StringObject(vm,url),body==null?null:new ByteArray(vm,body));
    if(signed==null)throw new IllegalStateException("No native signature");
    DvmObject<?>[] pairs=(DvmObject<?>[])signed.getValue();JSONObject headers=new JSONObject();
    for(int i=0;i<pairs.length;i+=2)headers.put(String.valueOf(pairs[i].getValue()),String.valueOf(pairs[i+1].getValue()));
    if(headers.size()!=6)throw new IllegalStateException("Incomplete native signature");result.put("headers",headers);return result;
  }
  public static void main(String[] args) throws Exception {
    PrintStream wire=System.out;System.setOut(new PrintStream(OutputStream.nullOutputStream()));
    ApkNativeWorker initialized;
    try { initialized=new ApkNativeWorker(new File(args[0])); }
    catch(Throwable failure) { JSONObject error=new JSONObject();error.put("ready",false);error.put("error",failure.getClass().getSimpleName());error.put("detail",String.valueOf(failure.getMessage()));wire.println(error.toJSONString());wire.flush();return; }
    try(ApkWorkerOwner owner=new ApkWorkerOwner(initialized);BufferedReader input=new BufferedReader(new InputStreamReader(System.in,java.nio.charset.StandardCharsets.UTF_8))) {
      wire.println("{\"ready\":true}");String line;
      while((line=input.readLine())!=null) {
        JSONObject request=null,reply=new JSONObject();
        try {if(line.length()>3*1024*1024)throw new IllegalArgumentException("Request too large");request=JSON.parseObject(line);reply.put("data",owner.worker.dispatch(request));reply.put("ok",true);}
        catch(Throwable failure){reply.put("ok",false);reply.put("error","APK native adapter failed: "+failure.getClass().getSimpleName());}
        if(request!=null)reply.put("id",request.get("id"));wire.println(reply.toJSONString());wire.flush();
      }
    }
  }
  static class ApkWorkerOwner implements AutoCloseable {final ApkNativeWorker worker;ApkWorkerOwner(ApkNativeWorker worker){this.worker=worker;}public void close() throws IOException {worker.emulator.close();}}
}
