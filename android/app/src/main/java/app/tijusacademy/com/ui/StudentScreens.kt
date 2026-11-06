package app.tijusacademy.com.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tijusacademy.com.data.Api
import app.tijusacademy.com.data.ClassSession
import app.tijusacademy.com.data.Slot
import app.tijusacademy.com.data.Times
import app.tijusacademy.com.data.TutorSummary
import app.tijusacademy.com.data.User
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay

private val studentTabs = listOf(
    Tab("classes", "My classes", Icons.Default.DateRange),
    Tab("book", "Book a tutor", Icons.Default.Person),
)

@Composable
fun StudentApp(user: User, refreshKey: Int, onJoin: (ClassSession) -> Unit, onExpired: () -> Unit, onSignOut: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf("classes") }
    PortalShell(user, studentTabs, tab, { tab = it }, onSignOut) { padding ->
        when (tab) {
            "classes" -> StudentClasses(padding, refreshKey, onJoin, onExpired)
            else -> BookTutor(padding, onExpired, onBooked = { tab = "classes" })
        }
    }
}

@Composable
private fun StudentClasses(
    padding: androidx.compose.foundation.layout.PaddingValues,
    refreshKey: Int,
    onJoin: (ClassSession) -> Unit,
    onExpired: () -> Unit,
) {
    var sessions by remember { mutableStateOf<List<ClassSession>?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val runner = Runner(rememberCoroutineScope(), onExpired) { error = it }

    suspend fun fetch() = coroutineScope {
        val all = async { Api.sessions() }
        // Booked 1-on-1 slots live on a hidden course, so they come from a separate list.
        val booked = async { Api.myBookings().map { it.asSession() } }
        val merged = (all.await() + booked.await()).distinctBy { it.id }
        sessions = merged
        error = null
    }

    fun reload() = runner.launch { refreshing = true; try { fetch() } finally { refreshing = false } }

    LaunchedEffect(refreshKey) {
        runner.launch { fetch() }
        // Keep "live" badges fresh while the screen is open, like the web 30s poll.
        while (true) { delay(30_000); runner.launch { fetch() } }
    }

    val list = sessions
    val live = list?.filter { it.isLive }.orEmpty().sortedBy { it.start }
    val upcoming = list?.filter { !it.isLive && !it.isPast }.orEmpty().sortedBy { it.start }
    val past = list?.filter { it.isPast && !it.isLive }.orEmpty().sortedByDescending { it.start }.take(15)

    RefreshList(padding, refreshing, ::reload) {
        item { ErrorBanner(error) }
        if (list == null) {
            item { Loading() }
            return@RefreshList
        }
        if (live.isNotEmpty()) {
            item { SectionTitle("Live now") }
            items(live, key = { "l${it.id}" }) { SessionCard(it, withTutor(it), onJoin) }
        }
        item { SectionTitle("Upcoming classes") }
        if (upcoming.isEmpty()) item { EmptyState("No upcoming classes. Book a slot with a tutor to get started.") }
        items(upcoming, key = { "u${it.id}" }) { SessionCard(it, withTutor(it), onJoin) }
        if (past.isNotEmpty()) {
            item { SectionTitle("Past classes") }
            items(past, key = { "p${it.id}" }) { SessionCard(it, withTutor(it), null) }
        }
    }
}

private fun withTutor(s: ClassSession) = if (s.tutorName.isNotBlank() && !s.title.contains(s.tutorName)) "with ${s.tutorName}" else ""

@Composable
fun Loading() {
    Row(Modifier.fillMaxWidth().padding(32.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
}

@Composable
private fun BookTutor(padding: androidx.compose.foundation.layout.PaddingValues, onExpired: () -> Unit, onBooked: () -> Unit) {
    var tutors by remember { mutableStateOf<List<TutorSummary>?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<TutorSummary?>(null) }
    val runner = Runner(rememberCoroutineScope(), onExpired) { error = it }

    fun reload() = runner.launch { refreshing = true; try { tutors = Api.bookableTutors(); error = null } finally { refreshing = false } }
    LaunchedEffect(Unit) { runner.launch { tutors = Api.bookableTutors() } }

    RefreshList(padding, refreshing, ::reload) {
        item { ErrorBanner(error) }
        item { SectionTitle("Tutors with open slots") }
        val list = tutors
        when {
            list == null -> item { Loading() }
            list.isEmpty() -> item { EmptyState("No tutor has open slots right now. Check back later.") }
            else -> items(list, key = { it.id }) { t ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().clickable { selected = t },
                ) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(t.name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                            if (t.specialization.isNotBlank()) Text(t.specialization, color = Muted, fontSize = 14.sp)
                        }
                        StatusPill("${t.openSlots} open", Color(0xFFFDE8D8), Color(0xFF9A4A10))
                    }
                }
            }
        }
    }

    selected?.let { t ->
        SlotsDialog(t, onExpired, onDismiss = { selected = null }, onBooked = { selected = null; reload(); onBooked() })
    }
}

@Composable
private fun SlotsDialog(tutor: TutorSummary, onExpired: () -> Unit, onDismiss: () -> Unit, onBooked: () -> Unit) {
    var slots by remember { mutableStateOf<List<Slot>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var bookingId by remember { mutableStateOf<Long?>(null) }
    var confirm by remember { mutableStateOf<Slot?>(null) }
    val runner = Runner(rememberCoroutineScope(), onExpired) { error = it; bookingId = null }

    LaunchedEffect(tutor.id) { runner.launch { slots = Api.tutorSlots(tutor.id) } }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Book with ${tutor.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ErrorBanner(error)
                val list = slots
                when {
                    list == null -> Loading()
                    list.isEmpty() -> EmptyState("No open slots left.")
                    else -> LazyColumn(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(list, key = { it.id }) { s ->
                            Card(colors = CardDefaults.cardColors(containerColor = Ground), shape = RoundedCornerShape(10.dp)) {
                                Row(Modifier.padding(10.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(Times.range(s.start, s.end), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                        if (s.note.isNotBlank()) Text(s.note, color = Muted, fontSize = 13.sp)
                                    }
                                    Button(onClick = { confirm = s }, enabled = bookingId == null) {
                                        Text(if (bookingId == s.id) "…" else "Book")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )

    confirm?.let { s ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Book this slot?") },
            text = { Text("${tutor.name}\n${Times.range(s.start, s.end)}") },
            confirmButton = {
                TextButton(onClick = {
                    confirm = null; bookingId = s.id; error = null
                    runner.launch { Api.bookSlot(s.id); bookingId = null; onBooked() }
                }) { Text("Book") }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }
}
