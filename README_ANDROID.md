# How to Build the Android App

This project is already set up with Capacitor to build an Android app.

## Prerequisites

1.  **Download Android Studio**: Install Android Studio from [developer.android.com](https://developer.android.com/studio).
2.  **Install Node.js**: Ensure Node.js is installed on your computer.

## Steps to Build APK

1.  **Download the Code**: Download the entire project folder to your computer.
2.  **Install Dependencies**: Open a terminal in the project folder and run:
    ```bash
    npm install
    ```
3.  **Build the Web App**: Run the build command to generate the `dist` folder:
    ```bash
    npm run build
    ```
4.  **Sync with Android**: Sync the web assets to the Android project:
    ```bash
    npx cap sync android
    ```
5.  **Open in Android Studio**:
    -   Open Android Studio.
    -   Select **Open an existing project**.
    -   Navigate to the `android` folder inside your project directory and select it.
6.  **Build the APK**:
    -   Wait for Gradle sync to finish.
    -   Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
    -   Once the build is complete, click **locate** to find your APK file.

## Troubleshooting

-   If you see errors about missing SDKs, open the **SDK Manager** in Android Studio and install the required Android SDK Platform and Build-Tools.
-   If the app shows a white screen, ensure your `capacitor.config.ts` has `webDir: 'dist'` (it is already configured).
