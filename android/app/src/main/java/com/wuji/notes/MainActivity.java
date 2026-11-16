package com.wuji.notes;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 雾记主界面：原生 WebView 壳，加载 assets 中的单页应用。
 * - WebViewAssetLoader 映射到 https 源，保证 localStorage / IndexedDB / fetch / getUserMedia 可用。
 * - 沉浸式全屏 + 刘海屏适配；边缘滑动唤出系统导航栏返回退出。
 * - 桥接相册/文件选择、相机拍照/录像、麦克风录音权限。
 */
public class MainActivity extends Activity {

    private static final int REQ_LOCATION = 1001;
    private static final int REQ_FILE_CHOOSER = 1002;
    private static final int REQ_RECORD_AUDIO = 1003;
    private static final int REQ_CAMERA = 1004;
    private static final int REQ_CAMERA_PERMISSION = 1005;
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingAudioRequest;
    private Uri captureOutputUri;      // 相机输出的 content Uri
    private boolean captureIsVideo;
    private boolean capturePendingPermission;
    private final Handler uiHandler = new Handler();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        // 关键：WebView 背景透明，露出窗口的天青色背景，避免沉浸式下顶部黑框
        web.setBackgroundColor(Color.TRANSPARENT);
        setContentView(web);
        setupCutout();

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
        settings.setMediaPlaybackRequiresUserGesture(false);
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
             * 桥接网页 <input type="file"> 到系统相册/文件选择器/相机。
             * 根据 accept 类型与 capture 属性决定走文件选择还是相机。
             */
            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                boolean wantsVideo = false, wantsImage = false;
                String[] accept = params.getAcceptTypes();
                if (accept != null) {
                    for (String t : accept) {
                        String low = t.toLowerCase(Locale.US);
                        if (low.contains("video")) wantsVideo = true;
                        if (low.contains("image")) wantsImage = true;
                    }
                }
                final boolean video = wantsVideo && !wantsImage;
                final boolean capture = params.isCaptureEnabled();

                if (capture) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                            && checkSelfPermission(Manifest.permission.CAMERA)
                            != PackageManager.PERMISSION_GRANTED) {
                        capturePendingPermission = true;
                        captureIsVideo = video;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA_PERMISSION);
                        return true;
                    }
                    launchCamera(video);
                    return true;
                }

                Intent intent = params.createIntent();
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    String title = video ? "选择视频" : (wantsImage ? "选择图片" : "选择文件");
                    startActivityForResult(Intent.createChooser(intent, title), REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }

            /** getUserMedia({audio:true}) 触发，必须 grant 否则拿不到麦克风。 */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                String[] resources = request.getResources();
                boolean wantsAudio = false;
                for (String r : resources) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                        wantsAudio = true;
                        break;
                    }
                }
                if (!wantsAudio) {
                    request.grant(resources);
                    return;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                        != PackageManager.PERMISSION_GRANTED) {
                    pendingAudioRequest = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
                    return;
                }
                request.grant(resources);
            }
        });

        // 运行时申请定位、麦克风权限（相机在点击拍摄时按需申请）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, REQ_LOCATION);
            }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
            }
        }

        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    /** 刘海屏/挖孔屏：内容延伸到状态栏区域，配合透明栏避免黑边。 */
    private void setupCutout() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
    }

    /** 启动系统相机拍照或录像，输出文件放到缓存目录，通过 FileProvider 暴露。 */
    private void launchCamera(boolean video) {
        captureIsVideo = video;
        File dir = new File(getCacheDir(), "capture");
        if (!dir.exists()) dir.mkdirs();
        String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File file = new File(dir, (video ? "VID_" : "IMG_") + stamp + (video ? ".mp4" : ".jpg"));
        captureOutputUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);

        Intent intent = video
                ? new Intent(MediaStore.ACTION_VIDEO_CAPTURE)
                : new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, captureOutputUri);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(intent, REQ_CAMERA);
        } catch (Exception e) {
            captureOutputUri = null;
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
            Toast.makeText(this, "无法启动相机", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RECORD_AUDIO && pendingAudioRequest != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                pendingAudioRequest.grant(pendingAudioRequest.getResources());
            } else {
                pendingAudioRequest.deny();
                Toast.makeText(this, "未授予麦克风权限，无法录音", Toast.LENGTH_SHORT).show();
            }
            pendingAudioRequest = null;
        } else if (requestCode == REQ_CAMERA_PERMISSION && capturePendingPermission) {
            capturePendingPermission = false;
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                launchCamera(captureIsVideo);
            } else {
                Toast.makeText(this, "未授予相机权限，无法拍摄", Toast.LENGTH_SHORT).show();
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                }
            }
        }
    }

    /** 接收相册选择 / 相机拍摄结果，回传给 WebView。 */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (filePathCallback == null) return;

        if (requestCode == REQ_FILE_CHOOSER) {
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
        } else if (requestCode == REQ_CAMERA) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && captureOutputUri != null) {
                results = new Uri[]{captureOutputUri};
                grantUriPermission(getPackageName(), captureOutputUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            captureOutputUri = null;
        }
    }

    /* ---------------- 沉浸式全屏 ---------------- */
    private void hideSystemUI() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
        uiHandler.postDelayed(new Runnable() {
            @Override
            public void run() { hideSystemUI(); }
        }, 400);
    }

    @Override
    public void onBackPressed() {
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
