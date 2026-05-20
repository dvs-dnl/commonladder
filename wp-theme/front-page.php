<?php
/**
 * Front Page Template
 *
 * @package CommonLadder
 */

get_header();
?>

<main id="main-content" role="main">

	<!-- =============================================
	     HERO SECTION
	     ============================================= -->
	<section class="hero" aria-labelledby="hero-title">
		<div class="container">
			<div class="hero__inner">

				<span class="hero__eyebrow">
					<?php echo esc_html( get_theme_mod( 'cl_hero_eyebrow', __( 'Free. Trusted. Always here.', 'common-ladder' ) ) ); ?>
				</span>

				<h1 class="hero__title" id="hero-title">
					<?php
					$hero_title = get_theme_mod( 'cl_hero_title', '' );
					if ( $hero_title ) {
						echo wp_kses( $hero_title, array( 'em' => array(), 'strong' => array() ) );
					} else {
						?>
						Find help, <em>right where you are.</em>
						<?php
					}
					?>
				</h1>

				<p class="hero__description">
					<?php esc_html_e( 'Common Ladder connects you to emergency shelter, food, health care, housing programs, legal aid, and crisis support — no matter where you are in your journey.', 'common-ladder' ); ?>
				</p>

				<!-- Zip Code Search -->
				<form
					class="hero__search"
					role="search"
					action="<?php echo esc_url( home_url( '/resources' ) ); ?>"
					method="get"
					aria-label="<?php esc_attr_e( 'Find local resources', 'common-ladder' ); ?>"
				>
					<label for="resource-zip" class="sr-only">
						<?php esc_html_e( 'Enter your ZIP code to find local resources', 'common-ladder' ); ?>
					</label>
					<input
						class="hero__search-input"
						id="resource-zip"
						type="text"
						name="zip"
						inputmode="numeric"
						pattern="[0-9]{5}"
						maxlength="5"
						placeholder="<?php esc_attr_e( 'Enter your ZIP code...', 'common-ladder' ); ?>"
						autocomplete="postal-code"
					>
					<button class="hero__search-btn" type="submit">
						<?php esc_html_e( 'Find Resources', 'common-ladder' ); ?>
					</button>
				</form>

				<!-- Trust signals -->
				<div class="hero__meta">
					<span class="hero__meta-item">
						<?php commonladder_get_svg( 'check' ); ?>
						<?php esc_html_e( 'Always free', 'common-ladder' ); ?>
					</span>
					<span class="hero__meta-item">
						<?php commonladder_get_svg( 'check' ); ?>
						<?php esc_html_e( 'No account required', 'common-ladder' ); ?>
					</span>
					<span class="hero__meta-item">
						<?php commonladder_get_svg( 'check' ); ?>
						<?php esc_html_e( 'Updated daily', 'common-ladder' ); ?>
					</span>
				</div>

			</div><!-- .hero__inner -->
		</div><!-- .container -->
	</section><!-- .hero -->


	<!-- =============================================
	     RESOURCE CATEGORY CARDS
	     ============================================= -->
	<section class="categories section" aria-labelledby="categories-title">
		<div class="container">

			<header class="section-header">
				<span class="section-header__eyebrow"><?php esc_html_e( 'Browse by need', 'common-ladder' ); ?></span>
				<h2 class="section-header__title" id="categories-title">
					<?php esc_html_e( 'Every kind of support, in one place.', 'common-ladder' ); ?>
				</h2>
				<p class="section-header__description">
					<?php esc_html_e( 'From a warm bed tonight to a permanent home — find verified resources matched to your situation.', 'common-ladder' ); ?>
				</p>
			</header>

			<div class="card-grid">

				<?php
				$categories = array(
					array(
						'slug'        => 'shelter',
						'icon'        => '🏠',
						'title'       => __( 'Emergency Shelter', 'common-ladder' ),
						'description' => __( 'Safe overnight beds, warming centers, and transitional housing options near you tonight.', 'common-ladder' ),
						'url'         => home_url( '/resources/shelter' ),
						'cta'         => __( 'Find shelter', 'common-ladder' ),
					),
					array(
						'slug'        => 'food',
						'icon'        => '🍽️',
						'title'       => __( 'Food & Meals', 'common-ladder' ),
						'description' => __( 'Soup kitchens, food pantries, and free meal programs serving your neighborhood.', 'common-ladder' ),
						'url'         => home_url( '/resources/food' ),
						'cta'         => __( 'Find food', 'common-ladder' ),
					),
					array(
						'slug'        => 'health',
						'icon'        => '❤️',
						'title'       => __( 'Health & Medical', 'common-ladder' ),
						'description' => __( 'Free clinics, mental health services, substance use support, and dental care.', 'common-ladder' ),
						'url'         => home_url( '/resources/health' ),
						'cta'         => __( 'Find health care', 'common-ladder' ),
					),
					array(
						'slug'        => 'housing',
						'icon'        => '🔑',
						'title'       => __( 'Housing Programs', 'common-ladder' ),
						'description' => __( 'Rental assistance, section 8, rapid rehousing, and permanent supportive housing.', 'common-ladder' ),
						'url'         => home_url( '/resources/housing' ),
						'cta'         => __( 'Find housing', 'common-ladder' ),
					),
					array(
						'slug'        => 'legal',
						'icon'        => '⚖️',
						'title'       => __( 'Legal Aid', 'common-ladder' ),
						'description' => __( 'Free legal help with evictions, benefits, criminal records, and identification documents.', 'common-ladder' ),
						'url'         => home_url( '/resources/legal' ),
						'cta'         => __( 'Find legal aid', 'common-ladder' ),
					),
					array(
						'slug'        => 'crisis',
						'icon'        => '📞',
						'title'       => __( 'Crisis Support', 'common-ladder' ),
						'description' => __( '24/7 hotlines, domestic violence shelters, and emergency intervention services.', 'common-ladder' ),
						'url'         => home_url( '/resources/crisis' ),
						'cta'         => __( 'Get crisis help', 'common-ladder' ),
					),
				);

				foreach ( $categories as $cat ) :
				?>
				<a
					class="category-card category-card--<?php echo esc_attr( $cat['slug'] ); ?>"
					href="<?php echo esc_url( $cat['url'] ); ?>"
					aria-label="<?php echo esc_attr( $cat['title'] ); ?>"
				>
					<div class="category-card__icon" aria-hidden="true"><?php echo $cat['icon']; ?></div>
					<h3 class="category-card__title"><?php echo esc_html( $cat['title'] ); ?></h3>
					<p class="category-card__description"><?php echo esc_html( $cat['description'] ); ?></p>
					<span class="category-card__arrow">
						<?php echo esc_html( $cat['cta'] ); ?>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.44 8.5H2.75a.75.75 0 0 1 0-1.5h8.69L8.22 4.03a.75.75 0 0 1 0-1.06z"/></svg>
					</span>
				</a>
				<?php endforeach; ?>

			</div><!-- .card-grid -->
		</div><!-- .container -->
	</section><!-- .categories -->


	<!-- =============================================
	     HOW IT WORKS
	     ============================================= -->
	<section class="how-it-works section" aria-labelledby="how-title">
		<div class="container">

			<header class="section-header">
				<span class="section-header__eyebrow"><?php esc_html_e( 'Simple to use', 'common-ladder' ); ?></span>
				<h2 class="section-header__title" id="how-title">
					<?php esc_html_e( 'Help is three steps away.', 'common-ladder' ); ?>
				</h2>
				<p class="section-header__description">
					<?php esc_html_e( 'No paperwork, no account, no judgment. Just clear, trustworthy information when you need it.', 'common-ladder' ); ?>
				</p>
			</header>

			<div class="steps-grid">

				<div class="step">
					<div class="step__number" aria-hidden="true">1</div>
					<h3 class="step__title"><?php esc_html_e( 'Enter your ZIP code', 'common-ladder' ); ?></h3>
					<p class="step__description">
						<?php esc_html_e( 'We find verified resources near you — updated in real time by local nonprofits and case managers.', 'common-ladder' ); ?>
					</p>
				</div>

				<div class="step">
					<div class="step__number" aria-hidden="true">2</div>
					<h3 class="step__title"><?php esc_html_e( 'Choose your need', 'common-ladder' ); ?></h3>
					<p class="step__description">
						<?php esc_html_e( 'Filter by shelter, food, health, housing, legal, or crisis support. See hours, eligibility, and directions.', 'common-ladder' ); ?>
					</p>
				</div>

				<div class="step">
					<div class="step__number" aria-hidden="true">3</div>
					<h3 class="step__title"><?php esc_html_e( 'Connect & get help', 'common-ladder' ); ?></h3>
					<p class="step__description">
						<?php esc_html_e( 'Call, walk in, or share the listing. Everything is free, private, and always available.', 'common-ladder' ); ?>
					</p>
				</div>

			</div><!-- .steps-grid -->
		</div><!-- .container -->
	</section><!-- .how-it-works -->


	<!-- =============================================
	     NONPROFIT CTA BAND
	     ============================================= -->
	<section class="cta-band section" aria-labelledby="cta-title">
		<div class="container">
			<div class="cta-band__inner">

				<div class="cta-band__content">
					<h2 class="cta-band__title" id="cta-title">
						<?php esc_html_e( 'Are you a nonprofit or service provider?', 'common-ladder' ); ?>
					</h2>
					<p class="cta-band__description">
						<?php esc_html_e( 'List your services on Common Ladder for free. Reach thousands of people who need exactly what you offer — and the case managers who connect them.', 'common-ladder' ); ?>
					</p>
				</div>

				<div class="cta-band__actions">
					<a class="btn btn--primary btn--lg" href="<?php echo esc_url( home_url( '/nonprofits/list-services' ) ); ?>">
						<?php esc_html_e( 'List your services', 'common-ladder' ); ?>
					</a>
					<a class="btn btn--ghost btn--lg" href="<?php echo esc_url( home_url( '/nonprofits' ) ); ?>">
						<?php esc_html_e( 'Learn more', 'common-ladder' ); ?>
					</a>
				</div>

			</div><!-- .cta-band__inner -->
		</div><!-- .container -->
	</section><!-- .cta-band -->


	<!-- =============================================
	     LATEST RESOURCES / POSTS (optional)
	     ============================================= -->
	<?php
	$recent_posts = new WP_Query( array(
		'post_type'      => 'post',
		'posts_per_page' => 3,
		'post_status'    => 'publish',
	) );

	if ( $recent_posts->have_posts() ) :
	?>
	<section class="section section--alt" aria-labelledby="latest-title">
		<div class="container">

			<header class="section-header">
				<span class="section-header__eyebrow"><?php esc_html_e( 'From the blog', 'common-ladder' ); ?></span>
				<h2 class="section-header__title" id="latest-title">
					<?php esc_html_e( 'Resources & guides', 'common-ladder' ); ?>
				</h2>
			</header>

			<div class="related-posts__grid">
				<?php while ( $recent_posts->have_posts() ) : $recent_posts->the_post(); ?>
				<article class="post-card">
					<?php if ( has_post_thumbnail() ) : ?>
					<img
						class="post-card__image"
						src="<?php the_post_thumbnail_url( 'cl-card' ); ?>"
						alt="<?php the_title_attribute(); ?>"
						loading="lazy"
						width="600"
						height="400"
					>
					<?php endif; ?>
					<div class="post-card__body">
						<?php
						$cats = get_the_category();
						if ( $cats ) :
						?>
						<a class="post-card__category" href="<?php echo esc_url( get_category_link( $cats[0]->term_id ) ); ?>">
							<?php echo esc_html( $cats[0]->name ); ?>
						</a>
						<?php endif; ?>
						<h3 class="post-card__title">
							<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
						</h3>
						<p class="post-card__excerpt"><?php echo esc_html( get_the_excerpt() ); ?></p>
					</div>
				</article>
				<?php endwhile; wp_reset_postdata(); ?>
			</div>

			<div class="section-footer">
				<a class="btn btn--secondary" href="<?php echo esc_url( home_url( '/blog' ) ); ?>">
					<?php esc_html_e( 'View all posts', 'common-ladder' ); ?>
				</a>
			</div>

		</div><!-- .container -->
	</section>
	<?php endif; ?>

</main><!-- #main-content -->

<?php get_footer(); ?>
