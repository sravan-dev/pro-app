package app.tijusacademy.com.data

import android.content.Context
import android.content.SharedPreferences
import android.webkit.CookieManager
import app.tijusacademy.com.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiException(message: String, val status: Int = 0) : Exception(message)

/** Login session is gone server-side; the app should return to the sign-in screen. */
class AuthExpiredException : Exception("Your session has expired. Please sign in again.")

/**
 * Keeps the express-session cookie across app restarts, the same way the
 * browser does for the web portal.
 */
private class PersistentCookieJar(private val prefs: SharedPreferences) : CookieJar {
    private val cookies = mutableMapOf<String, Cookie>()

    init {
        val base = BuildConfig.BASE_URL.toHttpUrl()
        prefs.getStringSet(KEY, emptySet())!!.forEach { raw ->
            Cookie.parse(base, raw)?.let { if (!it.expired()) cookies[it.name] = it }
        }
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { c -> if (c.expired()) this.cookies.remove(c.name) else this.cookies[c.name] = c }
        persist()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        cookies.values.filter { !it.expired() && it.matches(url) }

    @Synchronized
    fun all(): List<Cookie> = cookies.values.filter { !it.expired() }

    @Synchronized
    fun clear() {
        cookies.clear()
        persist()
    }

    private fun persist() {
        prefs.edit().putStringSet(KEY, cookies.values.map { it.toString() }.toSet()).apply()
    }

    private fun Cookie.expired() = persistent && expiresAt < System.currentTimeMillis()

    companion object { const val KEY = "cookies" }
}

object Api {
    val baseUrl: String = BuildConfig.BASE_URL
    private lateinit var jar: PersistentCookieJar
    private lateinit var http: OkHttpClient
    private val JSON = "application/json; charset=utf-8".toMediaType()
    /** For calls that must finish even if the screen that started them closes. */
    val background = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun init(context: Context) {
        if (::http.isInitialized) return
        jar = PersistentCookieJar(context.getSharedPreferences("tijus_http", Context.MODE_PRIVATE))
        http = OkHttpClient.Builder()
            .cookieJar(jar)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", "TijusLMS-Android/${BuildConfig.VERSION_NAME}")
                        .header("Accept", "application/json")
                        .build()
                )
            }
            .build()
    }

    /** Copy the login cookie into the WebView so the class room is signed in too. */
    fun syncCookiesToWebView() {
        val cm = CookieManager.getInstance()
        cm.setAcceptCookie(true)
        jar.all().forEach { c -> cm.setCookie(baseUrl, "${c.name}=${c.value}; Path=${c.path}") }
        cm.flush()
    }

    fun clearCookies() {
        jar.clear()
        CookieManager.getInstance().removeAllCookies(null)
    }

    private suspend fun call(method: String, path: String, body: JSONObject? = null): Any? =
        withContext(Dispatchers.IO) {
            val reqBody = when {
                body != null -> body.toString().toRequestBody(JSON)
                method == "GET" -> null
                else -> "{}".toRequestBody(JSON)
            }
            val req = Request.Builder().url("$baseUrl/api$path").method(method, reqBody).build()
            val res = try {
                http.newCall(req).execute()
            } catch (e: java.io.IOException) {
                throw ApiException("Can't reach the server. Check your internet connection.")
            }
            res.use { r ->
                val text = r.body?.string().orEmpty()
                val parsed: Any? = try {
                    when {
                        text.isBlank() -> null
                        text.trimStart().startsWith("[") -> JSONArray(text)
                        else -> JSONObject(text)
                    }
                } catch (e: Exception) {
                    // Proxy/host error pages come back as HTML.
                    throw ApiException("Server returned an unexpected response (HTTP ${r.code}). Please try again.", r.code)
                }
                if (r.code == 401 && path != "/auth/login") throw AuthExpiredException()
                if (!r.isSuccessful) {
                    val msg = (parsed as? JSONObject)?.optString("error").orEmpty()
                    throw ApiException(msg.ifBlank { "Request failed: ${r.code}" }, r.code)
                }
                parsed
            }
        }

    private suspend fun obj(method: String, path: String, body: JSONObject? = null) =
        call(method, path, body) as? JSONObject ?: JSONObject()

    private suspend fun arr(path: String) = call("GET", path) as? JSONArray ?: JSONArray()

    // ---- Auth ----
    suspend fun login(email: String, password: String): User =
        User.from(obj("POST", "/auth/login", JSONObject().put("email", email).put("password", password)).getJSONObject("user"))

    suspend fun currentUser(): User? {
        val r = obj("GET", "/auth/session")
        return if (r.optBoolean("authenticated")) User.from(r.getJSONObject("user")) else null
    }

    suspend fun logout() {
        try { obj("POST", "/auth/logout") } catch (_: Exception) {}
        clearCookies()
    }

    suspend fun forgotPassword(email: String): String =
        obj("POST", "/request-password-reset", JSONObject().put("email", email)).optString("message", "If that email exists, a reset link has been sent.")

    // ---- Shared ----
    suspend fun portalData(): JSONObject = obj("GET", "/portal-data")
    suspend fun sessions(): List<ClassSession> = arr("/sessions").map(ClassSession::from)

    // ---- Tutor ----
    suspend fun createSession(courseId: Long, studentId: Long?, start: String, end: String) {
        obj("POST", "/sessions", sessionBody(courseId, studentId, start, end))
    }

    suspend fun updateSession(id: Long, courseId: Long, studentId: Long?, start: String, end: String) {
        obj("PUT", "/sessions/$id", sessionBody(courseId, studentId, start, end))
    }

    private fun sessionBody(courseId: Long, studentId: Long?, start: String, end: String) =
        JSONObject().put("course_id", courseId).put("student_id", studentId?.toString() ?: "")
            .put("start_time", start).put("end_time", end)

    /** Closes this user's attendance log; safe to call even if the room already did. */
    suspend fun leaveSession(id: Long) { obj("POST", "/leave-session", JSONObject().put("session_id", id)) }

    suspend fun endSession(id: Long) { obj("POST", "/end-session", JSONObject().put("session_id", id)) }

    suspend fun mySlots(): List<Slot> = arr("/availability").map(Slot::from)

    suspend fun addSlot(start: String, end: String, note: String) {
        obj("POST", "/availability", JSONObject().put("start_time", start).put("end_time", end).put("note", note))
    }

    suspend fun deleteSlot(id: Long) { obj("DELETE", "/availability?id=$id") }

    // ---- Student ----
    suspend fun bookableTutors(): List<TutorSummary> = arr("/availability/tutors").map(TutorSummary::from)
    suspend fun tutorSlots(tutorId: Long): List<Slot> = arr("/availability?tutor_id=$tutorId").map(Slot::from)
    suspend fun bookSlot(slotId: Long) { obj("POST", "/book-slot", JSONObject().put("slot_id", slotId)) }
    suspend fun myBookings(): List<Booking> = arr("/my-bookings").map(Booking::from)
}

fun <T> JSONArray.map(f: (JSONObject) -> T): List<T> = (0 until length()).map { f(getJSONObject(it)) }
