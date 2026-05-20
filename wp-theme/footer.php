<footer class="site-footer" role="contentinfo">
	<div class="container">

		<div class="site-footer__top">

			<!-- Brand column -->
			<div class="footer-brand">
				<a class="footer-brand__logo" href="<?php echo esc_url( home_url( '/' ) ); ?>" aria-label="<?php echo esc_attr( get_bloginfo( 'name' ) ); ?> — <?php esc_attr_e( 'Go to homepage', 'common-ladder' ); ?>">
					<?php commonladder_logo_svg( 'site-logo__mark' ); ?>
					<span class="footer-brand__name">
						<span class="site-logo__text--common">common</span><span class="site-logo__text--ladder">ladder</span>
					</span>
				</a>
				<p class="footer-brand__tagline"><?php esc_html_e( 'Every rung, together.', 'common-ladder' ); ?></p>
				<p class="footer-brand__description">
					<?php esc_html_e( 'A civic platform connecting people experiencing homelessness to shelters, food, health care, housing, legal aid, and crisis services — always free.', 'common-ladder' ); ?>
				</p>
			</div>

			<!-- Resources nav -->
			<nav class="footer-nav" aria-label="<?php esc_attr_e( 'Footer resources links', 'common-ladder' ); ?>">
				<p class="footer-nav__title"><?php esc_html_e( 'Resources', 'common-ladder' ); ?></p>
				<?php
				if ( has_nav_menu( 'footer-1' ) ) {
					wp_nav_menu( array(
						'theme_location' => 'footer-1',
						'menu_class'     => 'footer-nav__list',
						'container'      => false,
						'depth'          => 1,
						'fallback_cb'    => false,
						'link_class'     => 'footer-nav__link',
					) );
				} else {
					?>
					<ul class="footer-nav__list">
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/shelter' ) ); ?>"><?php esc_html_e( 'Emergency Shelter', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/food' ) ); ?>"><?php esc_html_e( 'Food & Meals', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/health' ) ); ?>"><?php esc_html_e( 'Health & Medical', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/housing' ) ); ?>"><?php esc_html_e( 'Housing Programs', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/legal' ) ); ?>"><?php esc_html_e( 'Legal Aid', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/crisis' ) ); ?>"><?php esc_html_e( 'Crisis Support', 'common-ladder' ); ?></a></li>
					</ul>
					<?php
				}
				?>
			</nav>

			<!-- Organization nav -->
			<nav class="footer-nav" aria-label="<?php esc_attr_e( 'Footer organization links', 'common-ladder' ); ?>">
				<p class="footer-nav__title"><?php esc_html_e( 'Organization', 'common-ladder' ); ?></p>
				<?php
				if ( has_nav_menu( 'footer-2' ) ) {
					wp_nav_menu( array(
						'theme_location' => 'footer-2',
						'menu_class'     => 'footer-nav__list',
						'container'      => false,
						'depth'          => 1,
						'fallback_cb'    => false,
					) );
				} else {
					?>
					<ul class="footer-nav__list">
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/about' ) ); ?>"><?php esc_html_e( 'About Us', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/nonprofits' ) ); ?>"><?php esc_html_e( 'For Nonprofits', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/organizations' ) ); ?>"><?php esc_html_e( 'Organizations', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/blog' ) ); ?>"><?php esc_html_e( 'Blog', 'common-ladder' ); ?></a></li>
						<li><a class="footer-nav__link" href="<?php echo esc_url( home_url( '/contact' ) ); ?>"><?php esc_html_e( 'Contact', 'common-ladder' ); ?></a></li>
					</ul>
					<?php
				}
				?>
			</nav>

		</div><!-- .site-footer__top -->

		<div class="site-footer__bottom">
			<p class="site-footer__copyright">
				&copy; <?php echo esc_html( date( 'Y' ) ); ?>
				<?php echo esc_html( get_bloginfo( 'name' ) ); ?>.
				<?php esc_html_e( 'All rights reserved.', 'common-ladder' ); ?>
			</p>
			<nav class="site-footer__legal" aria-label="<?php esc_attr_e( 'Legal links', 'common-ladder' ); ?>">
				<a class="site-footer__legal-link" href="<?php echo esc_url( home_url( '/privacy-policy' ) ); ?>"><?php esc_html_e( 'Privacy', 'common-ladder' ); ?></a>
				<a class="site-footer__legal-link" href="<?php echo esc_url( home_url( '/terms' ) ); ?>"><?php esc_html_e( 'Terms', 'common-ladder' ); ?></a>
				<a class="site-footer__legal-link" href="<?php echo esc_url( home_url( '/accessibility' ) ); ?>"><?php esc_html_e( 'Accessibility', 'common-ladder' ); ?></a>
			</nav>
		</div><!-- .site-footer__bottom -->

	</div><!-- .container -->
</footer><!-- .site-footer -->

<?php wp_footer(); ?>
</body>
</html>
