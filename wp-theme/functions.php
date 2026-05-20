<?php
/**
 * Common Ladder Theme Functions
 *
 * @package CommonLadder
 * @version 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// =========================================================
// THEME CONSTANTS
// =========================================================
define( 'CL_THEME_VERSION', '1.0.0' );
define( 'CL_THEME_DIR', get_template_directory() );
define( 'CL_THEME_URI', get_template_directory_uri() );


// =========================================================
// THEME SETUP
// =========================================================
function commonladder_setup() {
	// Make the theme available for translation
	load_theme_textdomain( 'common-ladder', CL_THEME_DIR . '/languages' );

	// Add support for automatic feed links
	add_theme_support( 'automatic-feed-links' );

	// Let WordPress manage the document title
	add_theme_support( 'title-tag' );

	// Enable featured images
	add_theme_support( 'post-thumbnails' );
	set_post_thumbnail_size( 1200, 630, true );
	add_image_size( 'cl-card', 600, 400, true );
	add_image_size( 'cl-hero', 1600, 800, true );
	add_image_size( 'cl-avatar', 128, 128, true );

	// Register navigation menus
	register_nav_menus( array(
		'primary'  => __( 'Primary Navigation', 'common-ladder' ),
		'footer-1' => __( 'Footer: Resources', 'common-ladder' ),
		'footer-2' => __( 'Footer: Organization', 'common-ladder' ),
	) );

	// HTML5 support
	add_theme_support( 'html5', array(
		'search-form',
		'comment-form',
		'comment-list',
		'gallery',
		'caption',
		'style',
		'script',
	) );

	// Post formats
	add_theme_support( 'post-formats', array( 'aside', 'image', 'video', 'quote', 'link' ) );

	// Custom logo
	add_theme_support( 'custom-logo', array(
		'height'      => 80,
		'width'       => 200,
		'flex-height' => true,
		'flex-width'  => true,
	) );

	// Custom background
	add_theme_support( 'custom-background', array(
		'default-color' => 'F8F7F4',
	) );

	// Selective Refresh for Customizer
	add_theme_support( 'customize-selective-refresh-widgets' );

	// Block editor color palette
	add_theme_support( 'editor-color-palette', array(
		array(
			'name'  => __( 'Ladder Blue', 'common-ladder' ),
			'slug'  => 'ladder-blue',
			'color' => '#1C3D6E',
		),
		array(
			'name'  => __( 'Rung Amber', 'common-ladder' ),
			'slug'  => 'rung-amber',
			'color' => '#E8911A',
		),
		array(
			'name'  => __( 'Resource Sage', 'common-ladder' ),
			'slug'  => 'resource-sage',
			'color' => '#4A9E82',
		),
		array(
			'name'  => __( 'Commons White', 'common-ladder' ),
			'slug'  => 'commons-white',
			'color' => '#F8F7F4',
		),
		array(
			'name'  => __( 'Ground Dark', 'common-ladder' ),
			'slug'  => 'ground-dark',
			'color' => '#1A1A2E',
		),
	) );

	// Block editor font sizes
	add_theme_support( 'editor-font-sizes', array(
		array( 'name' => __( 'Small', 'common-ladder' ), 'slug' => 'small', 'size' => 14 ),
		array( 'name' => __( 'Normal', 'common-ladder' ), 'slug' => 'normal', 'size' => 16 ),
		array( 'name' => __( 'Large', 'common-ladder' ), 'slug' => 'large', 'size' => 20 ),
		array( 'name' => __( 'X-Large', 'common-ladder' ), 'slug' => 'x-large', 'size' => 24 ),
	) );

	// Disable core block patterns so our custom ones take precedence
	remove_theme_support( 'core-block-patterns' );

	// Wide/full alignment support
	add_theme_support( 'align-wide' );

	// Responsive embeds
	add_theme_support( 'responsive-embeds' );

	// Content width
	global $content_width;
	if ( ! isset( $content_width ) ) {
		$content_width = 800;
	}
}
add_action( 'after_setup_theme', 'commonladder_setup' );


// =========================================================
// ENQUEUE STYLES & SCRIPTS
// =========================================================
function commonladder_enqueue_assets() {
	// Google Fonts — Manrope (600) + Inter (400, 500)
	$fonts_url = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Manrope:wght@600&display=swap';
	wp_enqueue_style( 'common-ladder-fonts', $fonts_url, array(), null );

	// Main stylesheet
	wp_enqueue_style(
		'common-ladder-style',
		get_stylesheet_uri(),
		array( 'common-ladder-fonts' ),
		CL_THEME_VERSION
	);

	// Main JS (defer)
	wp_enqueue_script(
		'common-ladder-main',
		CL_THEME_URI . '/assets/js/main.js',
		array(),
		CL_THEME_VERSION,
		array( 'strategy' => 'defer', 'in_footer' => true )
	);

	// Comment reply script
	if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
		wp_enqueue_script( 'comment-reply' );
	}

	// Pass data to JS
	wp_localize_script( 'common-ladder-main', 'clData', array(
		'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
		'nonce'    => wp_create_nonce( 'cl-nonce' ),
		'siteUrl'  => home_url(),
		'themeUrl' => CL_THEME_URI,
	) );
}
add_action( 'wp_enqueue_scripts', 'commonladder_enqueue_assets' );


// =========================================================
// WIDGET AREAS
// =========================================================
function commonladder_register_widget_areas() {
	$widgets = array(
		array(
			'id'          => 'sidebar-main',
			'name'        => __( 'Main Sidebar', 'common-ladder' ),
			'description' => __( 'Appears alongside posts and pages.', 'common-ladder' ),
		),
		array(
			'id'          => 'footer-widget-1',
			'name'        => __( 'Footer Widget Area 1', 'common-ladder' ),
			'description' => __( 'First footer widget column.', 'common-ladder' ),
		),
		array(
			'id'          => 'footer-widget-2',
			'name'        => __( 'Footer Widget Area 2', 'common-ladder' ),
			'description' => __( 'Second footer widget column.', 'common-ladder' ),
		),
	);

	$defaults = array(
		'before_widget' => '<div id="%1$s" class="widget %2$s">',
		'after_widget'  => '</div>',
		'before_title'  => '<h3 class="widget-title">',
		'after_title'   => '</h3>',
	);

	foreach ( $widgets as $widget ) {
		register_sidebar( array_merge( $defaults, $widget ) );
	}
}
add_action( 'widgets_init', 'commonladder_register_widget_areas' );


// =========================================================
// CUSTOM EXCERPT
// =========================================================
function commonladder_excerpt_length( $length ) {
	return 25;
}
add_filter( 'excerpt_length', 'commonladder_excerpt_length' );

function commonladder_excerpt_more( $more ) {
	return '&hellip;';
}
add_filter( 'excerpt_more', 'commonladder_excerpt_more' );


// =========================================================
// BODY CLASSES
// =========================================================
function commonladder_body_classes( $classes ) {
	if ( is_singular() ) {
		$classes[] = 'singular';
	}
	if ( is_home() || is_front_page() ) {
		$classes[] = 'home-page';
	}
	$classes[] = 'cl-theme';
	return $classes;
}
add_filter( 'body_class', 'commonladder_body_classes' );


// =========================================================
// META DESCRIPTION (SEO HOOK)
// =========================================================
function commonladder_meta_description() {
	if ( is_front_page() ) {
		$description = __( 'Common Ladder connects people experiencing homelessness to shelters, food, health care, housing, legal aid, and crisis services — every rung, together.', 'common-ladder' );
	} elseif ( is_singular() ) {
		$description = get_the_excerpt();
	} elseif ( is_category() || is_tag() || is_tax() ) {
		$description = strip_tags( term_description() );
	} elseif ( is_archive() ) {
		$description = __( 'Browse homelessness resources, news, and guides on Common Ladder.', 'common-ladder' );
	} else {
		$description = get_bloginfo( 'description' );
	}

	if ( $description ) {
		$description = wp_strip_all_tags( $description, true );
		$description = esc_attr( wp_trim_words( $description, 30, '' ) );
		echo '<meta name="description" content="' . $description . '">' . "\n";
	}
}
add_action( 'wp_head', 'commonladder_meta_description', 1 );


// =========================================================
// OPEN GRAPH TAGS
// =========================================================
function commonladder_open_graph() {
	global $post;

	$og_title = is_singular() ? get_the_title() : get_bloginfo( 'name' );
	$og_url   = is_singular() ? get_permalink() : home_url( '/' );
	$og_image = '';

	if ( is_singular() && has_post_thumbnail() ) {
		$og_image = get_the_post_thumbnail_url( $post, 'full' );
	}

	echo '<meta property="og:site_name" content="' . esc_attr( get_bloginfo( 'name' ) ) . '">' . "\n";
	echo '<meta property="og:title" content="' . esc_attr( $og_title ) . '">' . "\n";
	echo '<meta property="og:url" content="' . esc_url( $og_url ) . '">' . "\n";
	echo '<meta property="og:type" content="' . ( is_singular( 'post' ) ? 'article' : 'website' ) . '">' . "\n";

	if ( $og_image ) {
		echo '<meta property="og:image" content="' . esc_url( $og_image ) . '">' . "\n";
	}
}
add_action( 'wp_head', 'commonladder_open_graph' );


// =========================================================
// SVG LOGO HELPER
// =========================================================
function commonladder_logo_svg( $class = 'site-logo__mark' ) {
	?>
	<svg class="<?php echo esc_attr( $class ); ?>" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
		<!-- Angled ladder mark -->
		<g transform="rotate(-15 20 20)">
			<!-- Left rail -->
			<rect x="8" y="4" width="3.5" height="32" rx="1.75" fill="#1C3D6E"/>
			<!-- Right rail -->
			<rect x="28.5" y="4" width="3.5" height="32" rx="1.75" fill="#1C3D6E"/>
			<!-- Rungs -->
			<rect x="8" y="9" width="24" height="3" rx="1.5" fill="#E8911A"/>
			<rect x="8" y="17" width="24" height="3" rx="1.5" fill="#E8911A"/>
			<rect x="8" y="25" width="24" height="3" rx="1.5" fill="#E8911A"/>
			<rect x="8" y="33" width="24" height="3" rx="1.5" fill="#E8911A"/>
		</g>
	</svg>
	<?php
}


// =========================================================
// PAGINATION HELPER
// =========================================================
function commonladder_pagination() {
	$args = array(
		'prev_text' => '&larr; ' . __( 'Previous', 'common-ladder' ),
		'next_text' => __( 'Next', 'common-ladder' ) . ' &rarr;',
		'before_page_number' => '<span class="sr-only">' . __( 'Page', 'common-ladder' ) . ' </span>',
		'type'      => 'array',
	);

	$links = paginate_links( $args );

	if ( $links ) {
		echo '<nav class="pagination" aria-label="' . esc_attr__( 'Posts navigation', 'common-ladder' ) . '">';
		foreach ( $links as $link ) {
			if ( strpos( $link, 'current' ) !== false ) {
				echo str_replace( '<span', '<span class="pagination__current"', $link );
			} else {
				echo str_replace( '<a', '<a class="pagination__link"', $link );
			}
		}
		echo '</nav>';
	}
}


// =========================================================
// BREADCRUMB HELPER
// =========================================================
function commonladder_breadcrumb() {
	echo '<nav class="breadcrumb" aria-label="' . esc_attr__( 'Breadcrumb', 'common-ladder' ) . '">';
	echo '<a class="breadcrumb__link" href="' . esc_url( home_url( '/' ) ) . '">' . esc_html__( 'Home', 'common-ladder' ) . '</a>';
	echo '<span class="breadcrumb__separator" aria-hidden="true">/</span>';

	if ( is_category() || is_tag() || is_tax() ) {
		echo '<span class="breadcrumb__current">' . esc_html( single_term_title( '', false ) ) . '</span>';
	} elseif ( is_singular( 'post' ) ) {
		$cats = get_the_category();
		if ( $cats ) {
			echo '<a class="breadcrumb__link" href="' . esc_url( get_category_link( $cats[0]->term_id ) ) . '">' . esc_html( $cats[0]->name ) . '</a>';
			echo '<span class="breadcrumb__separator" aria-hidden="true">/</span>';
		}
		echo '<span class="breadcrumb__current">' . esc_html( get_the_title() ) . '</span>';
	} elseif ( is_page() ) {
		if ( $post->post_parent ) {
			echo '<a class="breadcrumb__link" href="' . esc_url( get_permalink( $post->post_parent ) ) . '">' . esc_html( get_the_title( $post->post_parent ) ) . '</a>';
			echo '<span class="breadcrumb__separator" aria-hidden="true">/</span>';
		}
		echo '<span class="breadcrumb__current">' . esc_html( get_the_title() ) . '</span>';
	} elseif ( is_search() ) {
		echo '<span class="breadcrumb__current">' . esc_html__( 'Search results', 'common-ladder' ) . '</span>';
	} elseif ( is_404() ) {
		echo '<span class="breadcrumb__current">404</span>';
	} elseif ( is_archive() ) {
		echo '<span class="breadcrumb__current">' . esc_html( get_the_archive_title() ) . '</span>';
	}

	echo '</nav>';
}


// =========================================================
// READ TIME ESTIMATE
// =========================================================
function commonladder_read_time() {
	$content    = get_post_field( 'post_content', get_the_ID() );
	$word_count = str_word_count( strip_tags( $content ) );
	$minutes    = max( 1, (int) ceil( $word_count / 200 ) );
	return sprintf(
		/* translators: %d = number of minutes */
		_n( '%d min read', '%d min read', $minutes, 'common-ladder' ),
		$minutes
	);
}


// =========================================================
// INLINE SVG HELPER
// =========================================================
function commonladder_get_svg( $icon ) {
	$icons = array(
		'check' => '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>',
		'arrow' => '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.44 8.5H2.75a.75.75 0 0 1 0-1.5h8.69L8.22 4.03a.75.75 0 0 1 0-1.06z"/></svg>',
		'search' => '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="m13 13 3 3"/></svg>',
		'location' => '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M7 0C4.24 0 2 2.24 2 5c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5A1.5 1.5 0 1 1 7 3.5a1.5 1.5 0 0 1 0 3z"/></svg>',
	);

	return isset( $icons[ $icon ] ) ? $icons[ $icon ] : '';
}


// =========================================================
// REMOVE JQUERY MIGRATE (performance)
// =========================================================
function commonladder_remove_jquery_migrate( $scripts ) {
	if ( ! is_admin() && isset( $scripts->registered['jquery'] ) ) {
		$script = $scripts->registered['jquery'];
		if ( $script->deps ) {
			$script->deps = array_diff( $script->deps, array( 'jquery-migrate' ) );
		}
	}
}
add_action( 'wp_default_scripts', 'commonladder_remove_jquery_migrate' );


// =========================================================
// CUSTOMIZER SETTINGS
// =========================================================
function commonladder_customize_register( $wp_customize ) {
	// Section: Site Identity additions
	$wp_customize->add_setting( 'cl_tagline_display', array(
		'default'           => true,
		'sanitize_callback' => 'absint',
	) );
	$wp_customize->add_control( 'cl_tagline_display', array(
		'label'   => __( 'Display tagline in header', 'common-ladder' ),
		'section' => 'title_tagline',
		'type'    => 'checkbox',
	) );

	// Section: Homepage settings
	$wp_customize->add_section( 'cl_homepage', array(
		'title'    => __( 'Homepage Settings', 'common-ladder' ),
		'priority' => 130,
	) );

	$wp_customize->add_setting( 'cl_hero_eyebrow', array(
		'default'           => __( 'Free. Trusted. Always here.', 'common-ladder' ),
		'sanitize_callback' => 'sanitize_text_field',
	) );
	$wp_customize->add_control( 'cl_hero_eyebrow', array(
		'label'   => __( 'Hero Eyebrow Text', 'common-ladder' ),
		'section' => 'cl_homepage',
		'type'    => 'text',
	) );

	$wp_customize->add_setting( 'cl_hero_title', array(
		'default'           => __( 'Find help, right where you are.', 'common-ladder' ),
		'sanitize_callback' => 'wp_kses_post',
	) );
	$wp_customize->add_control( 'cl_hero_title', array(
		'label'   => __( 'Hero Title', 'common-ladder' ),
		'section' => 'cl_homepage',
		'type'    => 'textarea',
	) );
}
add_action( 'customize_register', 'commonladder_customize_register' );
