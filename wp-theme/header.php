<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<link rel="profile" href="https://gmpg.org/xfn/11">
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<a class="skip-to-content" href="#main-content">
	<?php esc_html_e( 'Skip to main content', 'common-ladder' ); ?>
</a>

<header class="site-header" role="banner">
	<div class="container">
		<div class="site-header__inner">

			<!-- Logo -->
			<a class="site-logo" href="<?php echo esc_url( home_url( '/' ) ); ?>" rel="home" aria-label="<?php echo esc_attr( get_bloginfo( 'name' ) ); ?> — <?php esc_attr_e( 'Go to homepage', 'common-ladder' ); ?>">
				<?php commonladder_logo_svg( 'site-logo__mark' ); ?>
				<span class="site-logo__text">
					<span class="site-logo__text--common">common</span><span class="site-logo__text--ladder">ladder</span>
				</span>
			</a>

			<!-- Primary Navigation (desktop) -->
			<nav class="primary-nav" id="primary-navigation" aria-label="<?php esc_attr_e( 'Primary navigation', 'common-ladder' ); ?>">
				<?php
				if ( has_nav_menu( 'primary' ) ) {
					wp_nav_menu( array(
						'theme_location'  => 'primary',
						'menu_class'      => 'primary-nav__list',
						'container'       => false,
						'link_before'     => '',
						'link_after'      => '',
						'walker'          => new CL_Primary_Nav_Walker(),
						'fallback_cb'     => false,
					) );
				} else {
					// Fallback hardcoded nav
					?>
					<ul class="primary-nav__list">
						<li><a class="primary-nav__link" href="<?php echo esc_url( home_url( '/resources' ) ); ?>"><?php esc_html_e( 'Resources', 'common-ladder' ); ?></a></li>
						<li><a class="primary-nav__link" href="<?php echo esc_url( home_url( '/organizations' ) ); ?>"><?php esc_html_e( 'Organizations', 'common-ladder' ); ?></a></li>
						<li><a class="primary-nav__link" href="<?php echo esc_url( home_url( '/nonprofits' ) ); ?>"><?php esc_html_e( 'For Nonprofits', 'common-ladder' ); ?></a></li>
						<li><a class="primary-nav__link" href="<?php echo esc_url( home_url( '/about' ) ); ?>"><?php esc_html_e( 'About', 'common-ladder' ); ?></a></li>
					</ul>
					<?php
				}
				?>
				<div class="primary-nav__cta">
					<a class="btn btn--primary btn--sm" href="<?php echo esc_url( home_url( '/get-help' ) ); ?>">
						<?php esc_html_e( 'Find Help Now', 'common-ladder' ); ?>
					</a>
				</div>
			</nav>

			<!-- Mobile Menu Toggle -->
			<button
				class="menu-toggle"
				id="menu-toggle"
				aria-expanded="false"
				aria-controls="mobile-navigation"
				aria-label="<?php esc_attr_e( 'Toggle mobile menu', 'common-ladder' ); ?>"
			>
				<span class="menu-toggle__bar" aria-hidden="true"></span>
				<span class="menu-toggle__bar" aria-hidden="true"></span>
				<span class="menu-toggle__bar" aria-hidden="true"></span>
			</button>

		</div><!-- .site-header__inner -->
	</div><!-- .container -->

	<!-- Mobile Navigation -->
	<div class="mobile-nav" id="mobile-navigation" aria-hidden="true">
		<div class="container">
			<ul class="mobile-nav__list" role="list">
				<li><a class="mobile-nav__link" href="<?php echo esc_url( home_url( '/resources' ) ); ?>"><?php esc_html_e( 'Resources', 'common-ladder' ); ?></a></li>
				<li><a class="mobile-nav__link" href="<?php echo esc_url( home_url( '/organizations' ) ); ?>"><?php esc_html_e( 'Organizations', 'common-ladder' ); ?></a></li>
				<li><a class="mobile-nav__link" href="<?php echo esc_url( home_url( '/nonprofits' ) ); ?>"><?php esc_html_e( 'For Nonprofits', 'common-ladder' ); ?></a></li>
				<li><a class="mobile-nav__link" href="<?php echo esc_url( home_url( '/about' ) ); ?>"><?php esc_html_e( 'About', 'common-ladder' ); ?></a></li>
			</ul>
			<div class="mobile-nav__cta">
				<a class="btn btn--primary btn--full" href="<?php echo esc_url( home_url( '/get-help' ) ); ?>">
					<?php esc_html_e( 'Find Help Now', 'common-ladder' ); ?>
				</a>
			</div>
		</div>
	</div><!-- .mobile-nav -->

</header><!-- .site-header -->

<?php
/**
 * Custom walker for primary nav — adds the class to <a> tags
 */
class CL_Primary_Nav_Walker extends Walker_Nav_Menu {
	public function start_el( &$output, $data_object, $depth = 0, $args = null, $current_object_id = 0 ) {
		$item       = $data_object;
		$indent     = str_repeat( "\t", $depth );
		$classes    = empty( $item->classes ) ? array() : (array) $item->classes;
		$class_names = join( ' ', apply_filters( 'nav_menu_css_class', array_filter( $classes ), $item, $args ) );
		$is_current = in_array( 'current-menu-item', $classes );

		$output .= $indent . '<li class="' . esc_attr( $class_names ) . '">';

		$atts          = array();
		$atts['href']  = ! empty( $item->url ) ? $item->url : '#';
		$atts['class'] = 'primary-nav__link' . ( $is_current ? ' current-menu-item' : '' );

		if ( $is_current ) {
			$atts['aria-current'] = 'page';
		}

		$attributes = '';
		foreach ( $atts as $attr => $value ) {
			$attributes .= ' ' . $attr . '="' . esc_attr( $value ) . '"';
		}

		$title   = apply_filters( 'the_title', $item->title, $item->ID );
		$output .= '<a' . $attributes . '>' . esc_html( $title ) . '</a>';
	}
}
