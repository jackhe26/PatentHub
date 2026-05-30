package com.patent.hub;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom Capacitor plugins before super.onCreate()
        registerPlugin(PdfRendererPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
