package com.yoski.simirork;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();

        if (webView != null) {
            webView.setDownloadListener(
                (url, userAgent, contentDisposition, mimetype, contentLength) -> {
                    try {
                        String fileName = URLUtil.guessFileName(
                            url,
                            contentDisposition,
                            mimetype
                        );

                        if (fileName == null || fileName.trim().isEmpty()) {
                            fileName = "simirork-app.apk";
                        }

                        if (!fileName.toLowerCase().endsWith(".apk")) {
                            fileName = fileName + ".apk";
                        }

                        DownloadManager.Request request =
                            new DownloadManager.Request(Uri.parse(url));

                        request.setTitle(fileName);
                        request.setDescription(
                            "Téléchargement de l'application Android"
                        );

                        request.setMimeType(
                            "application/vnd.android.package-archive"
                        );

                        if (userAgent != null && !userAgent.isEmpty()) {
                            request.addRequestHeader(
                                "User-Agent",
                                userAgent
                            );
                        }

                        String cookies =
                            CookieManager.getInstance().getCookie(url);

                        if (cookies != null && !cookies.isEmpty()) {
                            request.addRequestHeader(
                                "Cookie",
                                cookies
                            );
                        }

                        request.setNotificationVisibility(
                            DownloadManager.Request
                                .VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                        );

                        request.setDestinationInExternalPublicDir(
                            Environment.DIRECTORY_DOWNLOADS,
                            fileName
                        );

                        DownloadManager downloadManager =
                            (DownloadManager) getSystemService(
                                Context.DOWNLOAD_SERVICE
                            );

                        if (downloadManager == null) {
                            Toast.makeText(
                                this,
                                "Gestionnaire de téléchargement indisponible.",
                                Toast.LENGTH_LONG
                            ).show();
                            return;
                        }

                        downloadManager.enqueue(request);

                        Toast.makeText(
                            this,
                            "Téléchargement de l'APK lancé.",
                            Toast.LENGTH_SHORT
                        ).show();

                    } catch (Exception error) {
                        Toast.makeText(
                            this,
                            "Erreur pendant le téléchargement.",
                            Toast.LENGTH_LONG
                        ).show();

                        error.printStackTrace();
                    }
                }
            );
        }
    }
}