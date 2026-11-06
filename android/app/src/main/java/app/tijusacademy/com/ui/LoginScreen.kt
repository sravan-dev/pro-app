package app.tijusacademy.com.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.tijusacademy.com.R
import app.tijusacademy.com.data.Api
import app.tijusacademy.com.data.User
import kotlinx.coroutines.launch

/** Roles this app serves. Staff keep using the web portal. */
val APP_ROLES = setOf("student", "tutor")

@Composable
fun LoginScreen(onSignedIn: (User) -> Unit, notice: String?) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf(notice) }
    var showReset by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun submit() {
        if (busy) return
        if (email.isBlank() || password.isBlank()) { error = "Enter your email and password."; return }
        busy = true; error = null
        scope.launch {
            try {
                val user = Api.login(email.trim(), password)
                if (user.role !in APP_ROLES) {
                    Api.logout()
                    error = "This app is for students and tutors. Please use login.tijusacademy.com for staff accounts."
                } else onSignedIn(user)
            } catch (e: Exception) {
                error = e.message
            } finally { busy = false }
        }
    }

    Box(
        Modifier.fillMaxSize().background(Navy).systemBarsPadding().imePadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(20.dp).widthIn(max = 440.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Image(painterResource(R.drawable.logo), contentDescription = "Tiju's Academy", modifier = Modifier.size(width = 220.dp, height = 128.dp))
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("Sign in", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = NavyDark)
                    Text("Students and tutors: schedule and join your classes.", color = Muted)
                    ErrorBanner(error)
                    OutlinedTextField(
                        value = email, onValueChange = { email = it }, label = { Text("Email") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = password, onValueChange = { password = it }, label = { Text("Password") }, singleLine = true,
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = { TextButton(onClick = { showPassword = !showPassword }) { Text(if (showPassword) "Hide" else "Show") } },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { submit() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(onClick = { submit() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp)) {
                        if (busy) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                        else Text("Sign in")
                    }
                    TextButton(onClick = { showReset = true }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                        Text("Forgot password?")
                    }
                }
            }
        }
    }

    if (showReset) ForgotPasswordDialog(initialEmail = email, onDismiss = { showReset = false })
}

@Composable
private fun ForgotPasswordDialog(initialEmail: String, onDismiss: () -> Unit) {
    var email by remember { mutableStateOf(initialEmail) }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Reset password") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (done != null) InfoBanner(done) else {
                    Text("We'll email you a link to set a new password.")
                    ErrorBanner(error)
                    OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            }
        },
        confirmButton = {
            if (done != null) TextButton(onClick = onDismiss) { Text("Done") }
            else TextButton(enabled = !busy && email.isNotBlank(), onClick = {
                busy = true; error = null
                scope.launch {
                    try { done = Api.forgotPassword(email.trim()) } catch (e: Exception) { error = e.message } finally { busy = false }
                }
            }) { Text(if (busy) "Sending…" else "Send link") }
        },
        dismissButton = { if (done == null) TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
