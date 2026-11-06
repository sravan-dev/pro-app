package app.tijusacademy.com.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.tijusacademy.com.data.AuthExpiredException
import app.tijusacademy.com.data.User
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

data class Tab(val key: String, val label: String, val icon: ImageVector)

/** Runs API work, sending expired logins back to sign-in and errors to [onError]. */
class Runner(
    private val scope: CoroutineScope,
    private val onExpired: () -> Unit,
    private val onError: (String) -> Unit,
) {
    fun launch(block: suspend () -> Unit): Job = scope.launch {
        try { block() }
        catch (e: AuthExpiredException) { onExpired() }
        catch (e: Exception) { onError(e.message ?: "Something went wrong") }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortalShell(
    user: User,
    tabs: List<Tab>,
    selected: String,
    onSelect: (String) -> Unit,
    onSignOut: () -> Unit,
    floatingAction: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    var confirmSignOut by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    androidx.compose.foundation.layout.Column {
                        Text("Tijus LMS")
                        Text("${user.name} · ${user.role.replaceFirstChar { it.uppercase() }}", style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = Color(0xFFD6D5F0))
                    }
                },
                actions = {
                    IconButton(onClick = { confirmSignOut = true }) {
                        Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = "Sign out", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Navy, titleContentColor = Color.White),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                tabs.forEach { t ->
                    NavigationBarItem(
                        selected = t.key == selected,
                        onClick = { onSelect(t.key) },
                        icon = { Icon(t.icon, contentDescription = null) },
                        label = { Text(t.label) },
                    )
                }
            }
        },
        floatingActionButton = floatingAction,
        containerColor = Ground,
        content = content,
    )
    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text("Sign out?") },
            confirmButton = { TextButton(onClick = { confirmSignOut = false; onSignOut() }) { Text("Sign out") } },
            dismissButton = { TextButton(onClick = { confirmSignOut = false }) { Text("Cancel") } },
        )
    }
}

/** Pull-to-refresh list with the standard page padding. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshList(
    padding: PaddingValues,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    content: LazyListScope.() -> Unit,
) {
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize().padding(padding)) {
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize(),
            content = content,
        )
    }
}
