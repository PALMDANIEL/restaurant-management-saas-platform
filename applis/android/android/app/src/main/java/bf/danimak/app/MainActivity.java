package bf.danimak.app;

import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

// La plateforme est ouverte en ligne dans la WebView de Capacitor. La WebView d'Android
// ignore window.print() : on le relie à l'impression du système (reçus, QR codes des tables).
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new Impression(), "DaniMakAndroid");
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                view.evaluateJavascript(
                    "window.print = function () { DaniMakAndroid.imprimer(document.title || 'Dani Mak'); };",
                    null
                );
            }
        });
    }

    private class Impression {
        @JavascriptInterface
        public void imprimer(String titre) {
            runOnUiThread(() -> {
                WebView webView = getBridge().getWebView();
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                String nom = titre == null || titre.isEmpty() ? "Dani Mak" : titre;
                pm.print(nom, webView.createPrintDocumentAdapter(nom), new PrintAttributes.Builder().build());
            });
        }
    }
}
