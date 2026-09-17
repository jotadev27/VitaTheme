/**
 * Theme manifests written for tests.
 *
 * They follow the element names, ordering and value notation of real PS Vita themes — the
 * misspelled `Infomation*` elements included — but the content is invented, so no third
 * party's theme is redistributed here.
 */

export const COMPLETE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<theme format-ver="01.00" package="0">
\t<HomeProperty>
\t\t<m_bgParam>
\t\t\t<BackgroundParam>
\t\t\t\t<m_imageFilePath>bg1.png</m_imageFilePath>
\t\t\t\t<m_thumbnailFilePath>bg1t.png</m_thumbnailFilePath>
\t\t\t\t<m_waveType>24</m_waveType>
\t\t\t\t<m_fontColor>00D1FF</m_fontColor>
\t\t\t\t<m_fontShadow>1</m_fontShadow>
\t\t\t</BackgroundParam>
\t\t\t<BackgroundParam>
\t\t\t\t<m_imageFilePath>bg2.png</m_imageFilePath>
\t\t\t\t<m_thumbnailFilePath>bg2t.png</m_thumbnailFilePath>
\t\t\t\t<m_waveType>12</m_waveType>
\t\t\t\t<m_fontColor>FFFFFFFF</m_fontColor>
\t\t\t\t<m_fontShadow>0</m_fontShadow>
\t\t\t</BackgroundParam>
\t\t</m_bgParam>
\t\t<m_bgmFilePath>BGM.at9</m_bgmFilePath>
\t\t<m_browser>
\t\t\t<m_iconFilePath>icon_web.png</m_iconFilePath>
\t\t</m_browser>
\t\t<m_settings>
\t\t\t<m_iconFilePath>icon_settings.png</m_iconFilePath>
\t\t</m_settings>
\t\t<m_basePageFilePath>basePage.png</m_basePageFilePath>
\t\t<m_curPageFilePath>curPage.png</m_curPageFilePath>
\t</HomeProperty>
\t<InfomationBarProperty>
\t\t<m_barColor>FF202020</m_barColor>
\t\t<m_indicatorColor>FFFDFDFD</m_indicatorColor>
\t\t<m_noticeFontColor>FFFDFDFD</m_noticeFontColor>
\t\t<m_noticeGlowColor>00D1FF</m_noticeGlowColor>
\t\t<m_noNoticeFilePath>notices.png</m_noNoticeFilePath>
\t\t<m_newNoticeFilePath>notice.png</m_newNoticeFilePath>
\t</InfomationBarProperty>
\t<InfomationProperty>
\t\t<m_provider>
\t\t\t<m_default>Example Author</m_default>
\t\t\t<m_param>
\t\t\t\t<m_es>Autor de ejemplo</m_es>
\t\t\t\t<m_fr>Auteur d'exemple</m_fr>
\t\t\t</m_param>
\t\t</m_provider>
\t\t<m_contentVer>01.00</m_contentVer>
\t\t<m_title>
\t\t\t<m_default>Example Theme</m_default>
\t\t\t<m_param>
\t\t\t\t<m_es>Tema de ejemplo</m_es>
\t\t\t\t<m_fr>Theme d'exemple</m_fr>
\t\t\t</m_param>
\t\t</m_title>
\t\t<m_homePreviewFilePath>preview_home.png</m_homePreviewFilePath>
\t\t<m_startPreviewFilePath>preview_start.png</m_startPreviewFilePath>
\t\t<m_packageImageFilePath>preview_thumbnail.png</m_packageImageFilePath>
\t</InfomationProperty>
\t<StartScreenProperty>
\t\t<m_dateColor>00D1FF</m_dateColor>
\t\t<m_dateLayout>0</m_dateLayout>
\t\t<m_filePath>lockpaper.png</m_filePath>
\t\t<m_notifyBgColor>64FFFFFF</m_notifyBgColor>
\t\t<m_notifyBorderColor>20FFFFFF</m_notifyBorderColor>
\t\t<m_notifyFontColor>00D1FF</m_notifyFontColor>
\t</StartScreenProperty>
</theme>
`;

/** The smallest manifest a theme can have: one page and a name. */
export const MINIMAL_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<theme format-ver="01.00" package="0">
\t<HomeProperty>
\t\t<m_bgParam>
\t\t\t<BackgroundParam>
\t\t\t\t<m_imageFilePath>bg1.png</m_imageFilePath>
\t\t\t</BackgroundParam>
\t\t</m_bgParam>
\t</HomeProperty>
\t<InfomationProperty>
\t\t<m_default>ignored</m_default>
\t\t<m_contentVer>01.00</m_contentVer>
\t\t<m_title>
\t\t\t<m_default>Minimal</m_default>
\t\t</m_title>
\t</InfomationProperty>
</theme>
`;

export const manifestWith = (elements: string): string =>
  `<?xml version="1.0" encoding="utf-8"?>
<theme format-ver="01.00" package="0">
${elements}
</theme>
`;
