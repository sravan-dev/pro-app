package app.tijusacademy.com.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tijusacademy.com.data.ClassSession
import app.tijusacademy.com.data.Times
import java.time.LocalDateTime

val Navy = Color(0xFF2D2A6E)
val NavyDark = Color(0xFF1F1C4E)
val Orange = Color(0xFFE97A2B)
val LiveRed = Color(0xFFDC2626)
val Muted = Color(0xFF6B7280)
val Ground = Color(0xFFF3F4F6)

private val colors: ColorScheme = lightColorScheme(
    primary = Navy,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE4E3F5),
    onPrimaryContainer = NavyDark,
    secondary = Orange,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFDE8D8),
    onSecondaryContainer = Color(0xFF7A3A0C),
    background = Ground,
    surface = Color.White,
    onSurface = Color(0xFF1F2937),
    onSurfaceVariant = Muted,
    error = LiveRed,
)

@Composable
fun TijusTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = colors, content = content)

@Composable
fun ErrorBanner(message: String?, modifier: Modifier = Modifier) {
    if (message.isNullOrBlank()) return
    Surface(color = Color(0xFFFEE2E2), shape = RoundedCornerShape(10.dp), modifier = modifier.fillMaxWidth()) {
        Text(message, color = Color(0xFF991B1B), modifier = Modifier.padding(12.dp), fontSize = 14.sp)
    }
}

@Composable
fun InfoBanner(message: String?, modifier: Modifier = Modifier) {
    if (message.isNullOrBlank()) return
    Surface(color = Color(0xFFDCFCE7), shape = RoundedCornerShape(10.dp), modifier = modifier.fillMaxWidth()) {
        Text(message, color = Color(0xFF166534), modifier = Modifier.padding(12.dp), fontSize = 14.sp)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
        modifier = modifier.padding(top = 8.dp, bottom = 4.dp),
    )
}

@Composable
fun EmptyState(text: String) {
    Text(
        text, color = Muted, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
    )
}

@Composable
fun StatusPill(label: String, bg: Color, fg: Color) {
    Surface(color = bg, shape = RoundedCornerShape(50)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp)) {
            if (label == "LIVE") {
                Box(Modifier.size(7.dp).background(fg, CircleShape))
                Spacer(Modifier.width(5.dp))
            }
            Text(label, color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun SessionStatus(s: ClassSession) = when {
    s.isLive -> StatusPill("LIVE", Color(0xFFFEE2E2), LiveRed)
    s.status == "cancelled" -> StatusPill("Cancelled", Color(0xFFF3F4F6), Muted)
    s.isPast -> StatusPill("Completed", Color(0xFFE5E7EB), Color(0xFF374151))
    else -> StatusPill("Upcoming", Color(0xFFE4E3F5), Navy)
}

/**
 * One class row. [subtitle] is the "with tutor" / "for student" line; [actions]
 * holds role-specific buttons shown next to Join.
 */
@Composable
fun SessionCard(
    s: ClassSession,
    subtitle: String,
    onJoin: ((ClassSession) -> Unit)?,
    actions: @Composable () -> Unit = {},
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                SessionStatus(s)
            }
            if (subtitle.isNotBlank()) Text(subtitle, color = Muted, fontSize = 14.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.DateRange, null, tint = Muted, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(Times.range(s.start, s.end), fontSize = 14.sp)
            }
            if (onJoin != null && s.canJoin) {
                Spacer(Modifier.height(2.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(
                        onClick = { onJoin(s) },
                        colors = ButtonDefaults.buttonColors(containerColor = if (s.isLive) LiveRed else Navy),
                    ) { Text(if (s.isLive) "Join now" else "Join class") }
                    actions()
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { actions() }
            }
        }
    }
}

/** Read-only field that opens the platform date then time picker. */
@Composable
fun DateTimeField(label: String, value: LocalDateTime?, onChange: (LocalDateTime) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val open = {
        val base = value ?: LocalDateTime.now().plusHours(1).withMinute(0).withSecond(0).withNano(0)
        DatePickerDialog(ctx, { _, y, m, d ->
            TimePickerDialog(ctx, { _, h, min ->
                onChange(LocalDateTime.of(y, m + 1, d, h, min))
            }, base.hour, base.minute, false).show()
        }, base.year, base.monthValue - 1, base.dayOfMonth).apply {
            datePicker.minDate = System.currentTimeMillis() - 24 * 3600 * 1000L
        }.show()
    }
    Box(modifier) {
        OutlinedTextField(
            value = value?.let { "${Times.day(it)}, ${Times.clock(it)}" } ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            placeholder = { Text("Pick date & time") },
            trailingIcon = { Icon(Icons.Default.DateRange, null) },
            modifier = Modifier.fillMaxWidth(),
        )
        // Overlay catches the tap; a read-only TextField swallows clicks itself.
        Box(Modifier.matchParentSize().clickable { open() })
    }
}
