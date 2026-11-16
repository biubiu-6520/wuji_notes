import SwiftUI
import WebKit

/// 雾记 iOS 壳：WKWebView 加载包内 www/index.html，沉浸式全屏（状态栏隐藏）。
/// 数据存于 WKWebView 的本地存储；权限（相机/麦克风/相册）由 Info.plist 描述并在使用时系统弹窗授权。
struct ContentView: View {
    var body: some View {
        WebViewContainer()
            .edgesIgnoringSafeArea(.all)
            .statusBar(hidden: true)
    }
}

struct WebViewContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        let web = WKWebView(frame: .zero, configuration: config)
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.backgroundColor = UIColor(red: 0x7F/255, green: 0xA9/255, blue: 0xB0/255, alpha: 1)

        if let url = Bundle.main.url(forResource: "www/index", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View { ContentView() }
}
