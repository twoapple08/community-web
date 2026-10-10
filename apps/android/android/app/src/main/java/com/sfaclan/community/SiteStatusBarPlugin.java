package com.sfaclan.community;

import com.capacitorjs.plugins.statusbar.StatusBarPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.util.WebColor;
import java.util.Locale;

/**
 * @capacitor/status-bar 플러그인 확장판 (JS 에서 보이는 이름은 그대로 "StatusBar")
 *
 * <p>사이트(src/lib/appBridge.ts 의 setAppStatusBarTheme)가 테마를 바꿀 때 부르는
 * StatusBar.setStyle / setBackgroundColor 를 원래대로 처리한 뒤, 같은 색을 {@link MainActivity} 에도 알려
 * 상태바·내비게이션바 영역(막대 높이만큼 준 여백)을 칠하게 한다.
 * 안드로이드 15+ 는 상태바 색 지정이 무시되므로 이렇게 해야 사이트 테마와 막대 색이 맞는다.
 *
 * <p>MainActivity.onCreate 에서 initialPlugins 로 등록 (기본 StatusBar 플러그인보다 뒤에 등록되어 대신 쓰임)
 */
@CapacitorPlugin(name = "StatusBar")
public class SiteStatusBarPlugin extends StatusBarPlugin {

    @Override
    @PluginMethod
    public void setStyle(final PluginCall call) {
        final String style = call.getString("style");
        super.setStyle(call);
        if (style == null) return;
        // 원래 처리(메인 스레드에 예약됨) 다음에 실행되도록 같은 방식으로 예약
        getBridge().executeOnMainThread(() -> {
            MainActivity activity = mainActivity();
            if (activity != null) {
                activity.onSiteStatusBarStyle(style);
            }
        });
    }

    @Override
    @PluginMethod
    public void setBackgroundColor(final PluginCall call) {
        final String color = call.getString("color");
        super.setBackgroundColor(call);
        if (color == null) return;
        final int parsedColor;
        try {
            parsedColor = WebColor.parseColor(color.toUpperCase(Locale.ROOT));
        } catch (RuntimeException ex) {
            // 잘못된 색 문자열 → 원래 처리에서 reject 됨. 막대 색은 그대로 둠
            return;
        }
        getBridge().executeOnMainThread(() -> {
            MainActivity activity = mainActivity();
            if (activity != null) {
                activity.onSiteStatusBarColor(parsedColor);
            }
        });
    }

    private MainActivity mainActivity() {
        return getActivity() instanceof MainActivity ? (MainActivity) getActivity() : null;
    }
}
