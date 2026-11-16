package com.wuji.notes;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

/**
 * 雾记主界面：原生 WebView 壳，加载 assets 中的单页应用。
 * 使用 WebViewAssetLoader 映射到 https 源，保证 localStorage / IndexedDB / fetch 正常。
 */
public class MainActivity extends Activity {

    private static final int REQ_LOCATION = 1001;
    private static final int REQ_FILE_CHOOSER = 1002;
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setGeolocationEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(final String origin,
                                                           final GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            /**
             * 关键：桥接网页 <input type="file"> 到系统相册/文件选择器。
             * WebView 默认不支持文件选择，必须实现此回调，否则点"添加图片"无反应。
             */
            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                // 若上一次选择尚未回调，先取消它，避免回调丢失导致后续点击失效
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent intent = params.createIntent();
                intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                try {
                    startActivityForResult(Intent.createChooser(intent, "选择图片"), REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开图片选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, REQ_LOCATION);
        }

        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    /**
     * 接收系统相册选择结果，回传给 WebView。
     * 支持单选与多选；取消时传 null，保证 WebView 回调链完整。
     */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE_CHOOSER || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                results = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) {
                    results[i] = clip.getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onBackPressed() {
        // 单页应用，返回键直接退出，避免面板状态与原生历史冲突
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
