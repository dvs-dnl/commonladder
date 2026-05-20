<?php
/**
 * 404 Not Found Template
 *
 * @package CommonLadder
 */

get_header();
?>

<main id="main-content" role="main">
	<div class="container">

		<div class="error-page" role="region" aria-labelledby="error-title">

			<div class="error-page__icon" aria-hidden="true">🧭</div>
			<p class="error-page__code" aria-hidden="true">404</p>

			<h1 class="error-page__title" id="error-title">
				<?php esc_html_e( 'This rung is missing.', 'common-ladder' ); ?>
			</h1>

			<p class="error-page__description">
				<?php esc_html_e( "We couldn't find what you were looking for. The page may have moved, or the link might be broken — but help is still just a search away.", 'common-ladder' ); ?>
			</p>

			<!-- Search -->
			<div class="error-page__search" aria-label="<?php esc_attr_e( 'Search for resources', 'common-ladder' ); ?>">
				<form
					class="error-page__search-form"
					role="search"
					action="<?php echo esc_url( home_url( '/' ) ); ?>"
					method="get"
				>
					<label for="error-search-input" class="sr-only">
						<?php esc_html_e( 'Search the site', 'common-ladder' ); ?>
					</label>
					<input
						class="error-page__search-input"
						id="error-search-input"
						type="search"
						name="s"
						placeholder="<?php esc_attr_e( 'Search resources...', 'common-ladder' ); ?>"
						value="<?php echo esc_attr( get_search_query() ); ?>"
					>
					<button class="btn btn--primary" type="submit">
						<?php esc_html_e( 'Search', 'common-ladder' ); ?>
					</button>
				</form>
			</div>

			<!-- Quick links -->
			<div class="error-page__links">
				<a class="btn btn--secondary" href="<?php echo esc_url( home_url( '/' ) ); ?>">
					<?php esc_html_e( 'Go home', 'common-ladder' ); ?>
				</a>
				<a class="btn btn--secondary" href="<?php echo esc_url( home_url( '/resources' ) ); ?>">
					<?php esc_html_e( 'Browse resources', 'common-ladder' ); ?>
				</a>
				<a class="btn btn--secondary" href="<?php echo esc_url( home_url( '/resources/crisis' ) ); ?>">
					<?php esc_html_e( 'Crisis support', 'common-ladder' ); ?>
				</a>
			</div>

			<!-- Crisis line callout -->
			<div
				class="crisis-callout"
				role="complementary"
				aria-label="<?php esc_attr_e( 'Crisis resources', 'common-ladder' ); ?>"
			>
				<p class="crisis-callout__title">
					<?php esc_html_e( 'In immediate danger?', 'common-ladder' ); ?>
				</p>
				<p class="crisis-callout__text">
					<?php
					printf(
						/* translators: %s = 211 phone number link */
						esc_html__( 'Call or text %s — available 24/7 for immediate help and referrals.', 'common-ladder' ),
						'<a class="crisis-callout__link" href="tel:211">211</a>'
					);
					?>
				</p>
			</div>

		</div><!-- .error-page -->

	</div><!-- .container -->
</main><!-- #main-content -->

<?php get_footer(); ?>
