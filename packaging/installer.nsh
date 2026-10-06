; Classic assisted installer. All visible text is bundled and in English.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to VitaTheme v${VERSION} Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will install VitaTheme v${VERSION} on your computer.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customHeader
  BrandingText "VitaTheme v${VERSION}"
!macroend
