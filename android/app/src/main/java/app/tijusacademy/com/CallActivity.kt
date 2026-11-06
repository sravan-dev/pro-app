package app.tijusacademy.com

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Rational
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import app.tijusacademy.com.data.Api
import kotlinx.coroutines.launch

/**
 * The live class room. It hosts the same room page students and tutors use on
 * the web (/call/<id>), so video, chat, whiteboard and recording behave the
 * same everywhere. The login cookie is copied in, and the page auto-joins.
 */
class CallActivity : ComponentActivity() {
    private lateinit var web: WebView
    private var sessionId: Long = 0
    private var pendingPermission: PermissionRequest? = null
    private var finished = false

    private val askMedia = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val req = pendingPermission ?: return@registerForActivityResult
        pendingPermission = null
        grantAllowed(req, result)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(applicationContext)
        sessionId = intent.getLongExtra(EXTRA_ID, 0)
        title = intent.getStringExtra(EXTRA_TITLE) ?: "Class"
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = buildWebView()
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(web, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        // Keep the room clear of the status and navigation bars.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.updatePadding(left = bars.left, top = bars.top, right = bars.right, bottom = bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = confirmLeave()
        })

        // Ask for camera + mic up front so the room's device check passes first time.
        val missing = MEDIA.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) {
            registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { load() }
                .launch(missing.toTypedArray())
        } else load()
    }

    private fun load() {
        Api.syncCookiesToWebView()
        web.loadUrl("${Api.baseUrl}/call/$sessionId?autojoin=1")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView() = WebView(this).apply {
        setBackgroundColor(Color.BLACK)
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.userAgentString = settings.userAgentString + " TijusLMS-Android/${BuildConfig.VERSION_NAME}"
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

        // The page calls window.TijusApp.leave() when the user hangs up.
        addJavascriptInterface(object {
            @JavascriptInterface fun leave() = runOnUiThread { close(recordLeave = false) }
        }, "TijusApp")

        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                // Our own pages stay in the room; anything else (e.g. a shared link) opens outside.
                if (url.host == Uri.parse(Api.baseUrl).host) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }

            // The SPA navigates away from /call/ after leaving (older web builds without the bridge).
            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                val path = url?.let { Uri.parse(it).path }.orEmpty()
                if (path.isNotEmpty() && !path.startsWith("/call/")) {
                    // Landing on /login means the cookie didn't carry over.
                    if (path.startsWith("/login")) close(recordLeave = false, message = "Please sign in again to join.")
                    else close(recordLeave = false)
                }
            }
        }

        webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                if (request.origin.host != Uri.parse(Api.baseUrl).host) { request.deny(); return }
                val missing = MEDIA.filter { ContextCompat.checkSelfPermission(this@CallActivity, it) != PackageManager.PERMISSION_GRANTED }
                if (missing.isEmpty()) grantAllowed(request, emptyMap())
                else { pendingPermission = request; askMedia.launch(missing.toTypedArray()) }
            }
        }
    }

    /** Grant the page only what Android has granted the app. */
    private fun grantAllowed(req: PermissionRequest, justAsked: Map<String, Boolean>) {
        fun has(p: String) = justAsked[p] ?: (ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED)
        val ok = req.resources.filter {
            when (it) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> has(Manifest.permission.CAMERA)
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> has(Manifest.permission.RECORD_AUDIO)
                else -> false
            }
        }
        if (ok.isEmpty()) req.deny() else req.grant(ok.toTypedArray())
    }

    private fun confirmLeave() {
        AlertDialog.Builder(this)
            .setTitle("Leave this class?")
            .setMessage("You can rejoin from your class list while it's live.")
            .setPositiveButton("Leave") { _, _ -> close(recordLeave = true) }
            .setNegativeButton("Stay", null)
            .show()
    }

    private fun close(recordLeave: Boolean, message: String? = null) {
        if (finished) return
        finished = true
        if (recordLeave) {
            // App-wide scope: this activity is torn down right after.
            val id = sessionId
            Api.background.launch { runCatching { Api.leaveSession(id) } }
        }
        message?.let { android.widget.Toast.makeText(this, it, android.widget.Toast.LENGTH_LONG).show() }
        setResult(RESULT_OK)
        finish()
    }

    // Shrink to picture-in-picture when the user goes home mid-class.
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (!finished && packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            runCatching { enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build()) }
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        // Closing the PiP window stops the activity without a back press.
        if (!isInPictureInPictureMode && lifecycle.currentState == androidx.lifecycle.Lifecycle.State.CREATED) {
            close(recordLeave = true)
        }
    }

    override fun onDestroy() {
        web.apply {
            loadUrl("about:blank")
            removeJavascriptInterface("TijusApp")
            destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_ID = "session_id"
        private const val EXTRA_TITLE = "title"
        private val MEDIA = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)

        fun intent(context: Context, sessionId: Long, title: String) =
            Intent(context, CallActivity::class.java).putExtra(EXTRA_ID, sessionId).putExtra(EXTRA_TITLE, title)
    }
}
