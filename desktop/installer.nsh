!macro customInit
  DetailPrint "Closing any running Schofy instance before setup starts..."
  nsExec::ExecToLog 'taskkill /IM "Schofy.exe" /T /F'
  nsExec::ExecToLog 'taskkill /IM "Schofy Lite.exe" /T /F'
  nsExec::ExecToLog 'taskkill /IM "Schofy Unlocked.exe" /T /F'
  Sleep 2000
!macroend

!macro customInstall
  DetailPrint "Checking for a running Schofy instance..."
  nsExec::ExecToLog 'taskkill /IM "Schofy.exe" /T /F'
  nsExec::ExecToLog 'taskkill /IM "Schofy Lite.exe" /T /F'
  nsExec::ExecToLog 'taskkill /IM "Schofy Unlocked.exe" /T /F'
  DetailPrint "Refreshing Schofy desktop shortcuts..."
  Delete "$DESKTOP\Schofy.lnk"
  Delete "$DESKTOP\Schofy Lite.lnk"
  Delete "$DESKTOP\Schofy Unlocked.lnk"
  Delete "$SMPROGRAMS\Schofy.lnk"
  Delete "$SMPROGRAMS\Schofy Lite.lnk"
  Delete "$SMPROGRAMS\Schofy Unlocked.lnk"
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${ifNot} ${isNoDesktopShortcut}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  Sleep 1000
!macroend
