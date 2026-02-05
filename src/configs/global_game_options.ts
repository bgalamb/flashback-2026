export interface GameOptions {
    bypass_protection: boolean
    enable_password_menu: boolean
    enable_language_selection: boolean
    fade_out_palette: boolean
    use_text_cutscenes: boolean
    use_seq_cutscenes: boolean
    use_words_protection: boolean
    use_white_tshirt: boolean
    play_asc_cutscene: boolean
    play_caillou_cutscene: boolean
    play_metro_cutscene: boolean
    play_serrure_cutscene: boolean
    play_carte_cutscene: boolean
    play_gamesaved_sound: boolean
}

export const global_game_options: GameOptions = {
    bypass_protection: false,
    enable_password_menu: false,
    enable_language_selection: false,
    fade_out_palette: false,
    use_text_cutscenes: false,
    use_seq_cutscenes: false,
    use_words_protection: false,
    use_white_tshirt: false,
    play_asc_cutscene: false,
    play_caillou_cutscene: false,
    play_metro_cutscene: false,
    play_serrure_cutscene: false,
    play_carte_cutscene: false,
    play_gamesaved_sound: false,
}