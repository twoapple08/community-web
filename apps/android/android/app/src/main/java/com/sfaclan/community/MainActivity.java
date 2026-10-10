package com.sfaclan.community;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.ColorUtils;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

/**
 * 스틱파이터 커뮤니티 앱 화면 (https://www.sfaclan.com 을 웹뷰로 띄움)
 *
 * <p>Capacitor 기본 동작에 더해 이 화면이 직접 하는 일
 * <ul>
 *   <li>상태바·내비게이션바 여백: 사이트에는 safe-area 여백이 없으므로 웹뷰가 막대 아래로 들어가지 않게
 *       모든 안드로이드 버전에서 막대 높이만큼 여백을 준다 (안드로이드 15+ 의 강제 전체 화면 포함, 키보드가 뜨면 키보드 높이만큼).
 *       → 크롬에서 볼 때와 똑같은 화면</li>
 *   <li>막대 색: 사이트가 테마(라이트/다크)에 맞춰 StatusBar 플러그인으로 알려 주는 색으로 상태바·내비게이션바 영역을 칠한다.
 *       (안드로이드 15+ 는 상태바 색 지정 API 가 무시되므로 여백 영역을 직접 칠함, {@link SiteStatusBarPlugin} 참고)
 *       마지막 색을 기억해 다음 실행 때 처음부터 같은 색으로 시작</li>
 *   <li>알림 채널 sfa_alerts (중요도 높음 = 화면 위에 잠깐 펼쳐지는 알림) 를 미리 만들어 둠
 *       (사이트도 같은 채널을 만들지만, 사이트를 열기 전에 온 FCM 푸시도 이 채널로 오게)</li>
 * </ul>
 */
public class MainActivity extends BridgeActivity {

    /** 사이트 다크 테마 막대 색 (사이트 src/lib/appBridge.ts 의 STATUS_BAR_COLORS.dark 와 같음) */
    static final int SITE_DARK_COLOR = 0xFF09090B;
    /** 사이트 라이트 테마 막대 색 (STATUS_BAR_COLORS.light) */
    static final int SITE_LIGHT_COLOR = 0xFFFFFFFF;

    /** 알림 채널 id (사이트 src/lib/appNotify.ts, 매니페스트의 FCM 기본 채널과 같음) */
    static final String NOTIFICATION_CHANNEL_ID = "sfa_alerts";

    private static final String TAG = "SFAClan";
    private static final String PREFS_NAME = "sfa_system_bars";
    private static final String PREF_COLOR = "color";
    private static final String PREF_DARK = "dark";

    /** 상태바·내비게이션바 영역 색. 사이트 기본 테마가 다크이므로 처음에는 다크 */
    private int barColor = SITE_DARK_COLOR;
    /** 막대 배경이 어두운지 (true 면 막대 아이콘을 밝게) */
    private boolean barDark = true;

    /** 연결 실패 화면(offline.html)이 떠 있는 동안 뒤로가기 = 앱을 뒤로 보내기 (켜져 있을 때만 동작) */
    private OnBackPressedCallback offlineBackCallback;
    /** 연결 실패 화면을 보여 준 적이 있는지 (사이트로 돌아오면 남은 실패 기록을 지우기 위해) */
    private boolean shownOffline = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // @capacitor/status-bar 대신 사이트 테마 색을 막대 영역에도 칠하는 확장판을 등록
        // (initialPlugins 는 기본 플러그인 목록 뒤에 등록되므로 같은 이름 "StatusBar" 를 이 클래스가 차지함)
        initialPlugins.add(SiteStatusBarPlugin.class);
        super.onCreate(savedInstanceState);

        restoreBarTheme();
        setupEdgeToEdge();
        applyBarTheme();
        // SystemBars 플러그인이 시작하면서(메인 스레드에 예약된 작업) 창 배경·막대 아이콘 색을 기기 테마로 바꾸므로 그 뒤에 한 번 더 칠함
        new Handler(Looper.getMainLooper()).post(this::applyBarTheme);
        createNotificationChannel();
        setupOfflineBackHandling();
    }

    // ---------------------------------------------------------------------
    // 연결 실패 화면에서의 뒤로가기
    // ---------------------------------------------------------------------

    /**
     * 연결 실패 화면(offline.html)에서 뒤로가기를 누르면 실패한 주소를 다시 불러와 같은 화면만 반복되던 문제,
     * 다시 연결된 뒤 첫 뒤로가기가 앱을 내리지 않고 사이트를 새로 불러오던 문제를 막는다.
     * - 실패 화면이 떠 있는 동안: 뒤로가기 = 앱을 뒤로 보내기 (홈 화면으로)
     * - 사이트로 돌아오면: 실패 화면 방문 기록을 지워, 첫 화면에서 뒤로가기 = 사이트 기본 동작(앱 내리기)
     * (App 플러그인의 뒤로가기 처리보다 나중에 등록하므로, 켜져 있을 때는 이쪽이 먼저 받음)
     */
    private void setupOfflineBackHandling() {
        offlineBackCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                moveTaskToBack(true);
            }
        };
        getOnBackPressedDispatcher().addCallback(this, offlineBackCallback);
        if (bridge == null) return;
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageStarted(WebView webView) {
                offlineBackCallback.setEnabled(false);
            }

            @Override
            public void onPageLoaded(WebView webView) {
                String url = webView.getUrl();
                String errorUrl = bridge.getErrorUrl();
                boolean offline = url != null && errorUrl != null && url.startsWith(errorUrl);
                offlineBackCallback.setEnabled(offline);
                if (offline) {
                    shownOffline = true;
                } else if (shownOffline) {
                    webView.clearHistory();
                    shownOffline = false;
                }
            }
        });
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        // 회전·창 크기 변경·다크 모드 전환 등은 화면을 다시 만들지 않고 여기로 옴 (매니페스트 configChanges)
        super.onConfigurationChanged(newConfig);
        // SystemBars·StatusBar 플러그인이 설정 변경 때 막대 모양을 다시 정하므로 사이트 테마 색으로 다시 칠함
        applyBarTheme();
    }

    // ---------------------------------------------------------------------
    // 사이트(StatusBar 플러그인)가 테마를 알려 줄 때 — SiteStatusBarPlugin 이 메인 스레드에서 부름
    // ---------------------------------------------------------------------

    /** StatusBar.setStyle: "DARK" = 어두운 배경(밝은 아이콘), "LIGHT" = 밝은 배경(어두운 아이콘), "DEFAULT" = 기기 테마 */
    void onSiteStatusBarStyle(String style) {
        String value = style == null ? "" : style.toUpperCase(Locale.ROOT);
        boolean dark;
        if ("DARK".equals(value)) {
            dark = true;
        } else if ("LIGHT".equals(value)) {
            dark = false;
        } else {
            dark = isSystemNightMode();
        }
        barDark = dark;
        // 색은 보통 바로 뒤의 setBackgroundColor 로 정확한 값이 오지만, 안 오더라도 테마에 맞는 색으로 칠함
        barColor = dark ? SITE_DARK_COLOR : SITE_LIGHT_COLOR;
        saveBarTheme();
        applyBarTheme();
    }

    /** StatusBar.setBackgroundColor: 막대 영역을 이 색으로 칠하고, 색 밝기에 맞춰 아이콘 색을 정함 */
    void onSiteStatusBarColor(int color) {
        // 반투명 색이면 뒤의 창 배경이 비쳐 보이므로 불투명하게
        barColor = color | 0xFF000000;
        barDark = ColorUtils.calculateLuminance(barColor) < 0.5;
        saveBarTheme();
        applyBarTheme();
    }

    // ---------------------------------------------------------------------
    // 막대 여백·색
    // ---------------------------------------------------------------------

    /**
     * 모든 버전에서 전체 화면(edge-to-edge) 배치로 통일한 뒤, 창 최상위 뷰에 막대·화면 구멍(카메라)·키보드 높이만큼 여백을 준다.
     * 여백 부분에는 창 배경색(= 사이트 테마 색)이 보여 막대 배경 역할을 한다.
     * (Capacitor SystemBars 플러그인이 viewport-fit=cover 가 아닐 때 하는 방식과 같음. 사이트는 cover 라서 직접 처리)
     */
    @SuppressWarnings("deprecation")
    private void setupEdgeToEdge() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            // 안드로이드 14 이하: 막대를 투명하게 해서 아래 여백의 색이 보이게 (15+ 는 원래 투명)
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            // 안드로이드 8 미만은 내비게이션바 아이콘을 어둡게 바꿀 수 없어 검은 막대로 둠 (라이트 테마에서 흰 아이콘이 안 보이는 문제 방지)
            window.setNavigationBarColor(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? Color.TRANSPARENT : Color.BLACK);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // 3버튼 내비게이션에서 시스템이 반투명 막을 덧씌우지 않게 (사이트 색이 그대로 보이게)
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        View decorView = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (view, insets) -> {
            int barTypes = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = insets.getInsets(barTypes);
            int bottom = bars.bottom;
            if (insets.isVisible(WindowInsetsCompat.Type.ime())) {
                // 키보드가 떠 있으면 키보드 높이만큼 (입력창이 키보드에 가려지지 않게, 크롬처럼 화면이 줄어듦)
                bottom = Math.max(bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
            }
            view.setPadding(bars.left, bars.top, bars.right, bottom);
            // 웹뷰에는 막대 여백을 0 으로 전달 → 사이트의 env(safe-area-inset-*) 도 0 (크롬과 같음)
            // (CONSUMED 를 돌려주면 웹뷰가 이전 값을 계속 쓰는 문제가 있어 0 으로 명시. Capacitor SystemBars 와 같은 방식)
            return new WindowInsetsCompat.Builder(insets).setInsets(barTypes, Insets.of(0, 0, 0, 0)).build();
        });
        decorView.requestApplyInsets();
    }

    /** 현재 테마 색을 막대 영역(창 배경)·막대 아이콘·웹뷰 배경(사이트가 그려지기 전 빈 화면)에 적용 */
    private void applyBarTheme() {
        try {
            Window window = getWindow();
            View decorView = window.getDecorView();
            decorView.setBackgroundColor(barColor);

            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
            // "밝은 막대" = 어두운 아이콘
            controller.setAppearanceLightStatusBars(!barDark);
            controller.setAppearanceLightNavigationBars(!barDark);

            WebView webView = bridge != null ? bridge.getWebView() : null;
            if (webView != null) {
                webView.setBackgroundColor(barColor);
            }
        } catch (Exception ex) {
            Logger.warn(TAG, "막대 색 적용 실패: " + ex.getMessage());
        }
    }

    private boolean isSystemNightMode() {
        int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void restoreBarTheme() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            if (prefs.contains(PREF_COLOR)) {
                barColor = prefs.getInt(PREF_COLOR, SITE_DARK_COLOR) | 0xFF000000;
                barDark = prefs.getBoolean(PREF_DARK, true);
            }
        } catch (Exception ex) {
            Logger.warn(TAG, "막대 색 불러오기 실패: " + ex.getMessage());
        }
    }

    private void saveBarTheme() {
        try {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putInt(PREF_COLOR, barColor).putBoolean(PREF_DARK, barDark).apply();
        } catch (Exception ex) {
            Logger.warn(TAG, "막대 색 저장 실패: " + ex.getMessage());
        }
    }

    // ---------------------------------------------------------------------
    // 알림 채널
    // ---------------------------------------------------------------------

    /** 사이트(appNotify.ts)가 만드는 채널과 같은 설정. 이미 있으면 건드리지 않음 (사용자가 바꾼 설정 유지) */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null || manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null) return;

            NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(getString(R.string.notification_channel_description));
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableVibration(true);
            channel.enableLights(true);
            channel.setLightColor(0xFF10B981);
            manager.createNotificationChannel(channel);
        } catch (Exception ex) {
            Logger.warn(TAG, "알림 채널 만들기 실패: " + ex.getMessage());
        }
    }
}
