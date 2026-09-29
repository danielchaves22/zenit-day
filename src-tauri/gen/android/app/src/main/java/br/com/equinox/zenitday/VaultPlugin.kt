package br.com.equinox.zenitday

import android.app.Activity
import android.content.Intent
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class SessionArgs { var key: String = ""; var value: String? = null }
@InvokeArg
class ExportArgs { var name: String = "Zenit-Day.json"; var contents: String = "" }

@TauriPlugin
class VaultPlugin(private val host: Activity): Plugin(host) {
    private val preferences = host.getSharedPreferences("zenit-day-session", Activity.MODE_PRIVATE)
    private val alias = "zenit-day-auth-v1"
    private fun encryptionKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    @Command
    fun read(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SessionArgs::class.java)
            val stored = preferences.getString(args.key, null)
            val result = JSObject()
            if (stored != null) {
                val parts = stored.split(":")
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
                cipher.updateAAD(args.key.toByteArray(Charsets.UTF_8))
                result.put("value", String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
            }
            invoke.resolve(result)
        } catch (_: Exception) { invoke.reject("Não foi possível abrir a sessão protegida.") }
    }
    @Command
    fun write(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SessionArgs::class.java)
            val editor = preferences.edit()
            if (args.value == null) editor.remove(args.key) else {
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
                cipher.updateAAD(args.key.toByteArray(Charsets.UTF_8))
                val encrypted = cipher.doFinal(args.value!!.toByteArray(Charsets.UTF_8))
                editor.putString(args.key, Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP))
            }
            if (!editor.commit()) throw IllegalStateException()
            invoke.resolve()
        } catch (_: Exception) { invoke.reject("Não foi possível guardar a sessão protegida.") }
    }
    @Command
    fun exportBackup(invoke: Invoke) {
        val args = invoke.parseArgs(ExportArgs::class.java)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type="application/json"; putExtra(Intent.EXTRA_TITLE,args.name) }
        startActivityForResult(invoke,intent,"exportResult")
    }
    @ActivityCallback
    private fun exportResult(invoke: Invoke, result: ActivityResult) {
        val output = JSObject()
        if(result.resultCode != Activity.RESULT_OK || result.data?.data == null) { output.put("saved",false);invoke.resolve(output);return }
        try {
            val contents = invoke.parseArgs(ExportArgs::class.java).contents
            host.contentResolver.openOutputStream(result.data!!.data!!,"wt")!!.use { it.write(contents.toByteArray(Charsets.UTF_8)) }
            output.put("saved",true); invoke.resolve(output)
        } catch (_: Exception) { invoke.reject("Não foi possível salvar a cópia.") }
    }
    @Command
    fun importBackup(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE);type="application/json" }
        startActivityForResult(invoke,intent,"importResult")
    }
    @ActivityCallback
    private fun importResult(invoke: Invoke, result: ActivityResult) {
        val output = JSObject()
        if(result.resultCode != Activity.RESULT_OK || result.data?.data == null) {invoke.resolve(output);return}
        try {
            val bytes = host.contentResolver.openInputStream(result.data!!.data!!)!!.use { input ->
                val out=java.io.ByteArrayOutputStream(); val buffer=ByteArray(8192)
                while(true) { val count=input.read(buffer);if(count<0)break;if(out.size()+count>20_000_000)throw IllegalArgumentException();out.write(buffer,0,count) };out.toByteArray()
            }
            output.put("contents",String(bytes,Charsets.UTF_8));invoke.resolve(output)
        } catch (_: Exception) {invoke.reject("A cópia não pôde ser lida ou excede 20 MB.")}
    }
}
