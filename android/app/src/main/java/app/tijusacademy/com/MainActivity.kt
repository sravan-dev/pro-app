package app.tijusacademy.com

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import app.tijusacademy.com.data.Api
import app.tijusacademy.com.data.User
import app.tijusacademy.com.ui.APP_ROLES
import app.tijusacademy.com.ui.LoginScreen
import app.tijusacademy.com.ui.Navy
import app.tijusacademy.com.ui.StudentApp
import app.tijusacademy.com.ui.TijusTheme
import app.tijusacademy.com.ui.TutorApp
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Api.init(applicationContext)
        setContent { TijusTheme { Root() } }
    }
}

private sealed interface Auth {
    data object Checking : Auth
    data class SignedOut(val notice: String? = null) : Auth
    data class SignedIn(val user: User) : Auth
}

@Composable
private fun Root() {
    var auth by remember { mutableStateOf<Auth>(Auth.Checking) }
    // Bumped when a class window closes so lists pick up the new status.
    var refreshKey by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val callLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { refreshKey++ }

    LaunchedEffect(Unit) {
        auth = try {
            val u = Api.currentUser()
            if (u != null && u.role in APP_ROLES) Auth.SignedIn(u) else Auth.SignedOut()
        } catch (e: Exception) {
            // Offline at launch: show sign-in with the reason rather than a blank screen.
            Auth.SignedOut(e.message)
        }
    }

    val expired = { Api.clearCookies(); auth = Auth.SignedOut("Your session has expired. Please sign in again.") }
    val signOut: () -> Unit = { scope.launch { Api.logout(); auth = Auth.SignedOut() } }
    val join: (app.tijusacademy.com.data.ClassSession) -> Unit = { s ->
        callLauncher.launch(CallActivity.intent(context, s.id, s.title))
    }

    when (val a = auth) {
        Auth.Checking -> Box(Modifier.fillMaxSize().background(Navy), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Color.White)
        }
        is Auth.SignedOut -> LoginScreen(onSignedIn = { auth = Auth.SignedIn(it) }, notice = a.notice)
        is Auth.SignedIn -> when (a.user.role) {
            "tutor" -> TutorApp(a.user, refreshKey, join, expired, signOut)
            else -> StudentApp(a.user, refreshKey, join, expired, signOut)
        }
    }
}
