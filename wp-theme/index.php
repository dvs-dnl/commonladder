<?php
/**
 * Main Template Fallback
 *
 * Used when no more specific template is found in the template hierarchy.
 *
 * @package CommonLadder
 */

get_header();
?>

<main id="main-content" role="main">
	<div class="container">
		<div class="page-content">

			<?php commonladder_breadcrumb(); ?>

			<?php if ( have_posts() ) : ?>

				<header class="page-header">
					<?php
					if ( is_home() && ! is_front_page() ) {
						// Blog page title
						single_post_title( '<h1 class="page-header__title">', '</h1>' );
					} elseif ( is_archive() ) {
						the_archive_title( '<h1 class="page-header__title">', '</h1>' );
						the_archive_description( '<p class="page-header__description">', '</p>' );
					} elseif ( is_search() ) {
						printf(
							'<h1 class="page-header__title">%s</h1>',
							sprintf(
								/* translators: %s = search term */
								esc_html__( 'Search results for: %s', 'common-ladder' ),
								'<em>' . get_search_query() . '</em>'
							)
						);
					}
					?>
				</header>

				<div class="archive-grid">
					<?php
					while ( have_posts() ) :
						the_post();
						?>
						<article id="post-<?php the_ID(); ?>" <?php post_class( 'post-card' ); ?>>
							<?php if ( has_post_thumbnail() ) : ?>
							<a href="<?php the_permalink(); ?>" tabindex="-1" aria-hidden="true">
								<img
									class="post-card__image"
									src="<?php the_post_thumbnail_url( 'cl-card' ); ?>"
									alt=""
									loading="lazy"
									width="600"
									height="400"
								>
							</a>
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
								<h2 class="post-card__title">
									<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
								</h2>
								<p class="post-card__excerpt"><?php echo esc_html( get_the_excerpt() ); ?></p>
							</div>
						</article>
					<?php endwhile; ?>
				</div><!-- .archive-grid -->

				<?php commonladder_pagination(); ?>

			<?php else : ?>

				<p><?php esc_html_e( 'No content found. Please try a different search or browse by category.', 'common-ladder' ); ?></p>
				<?php get_search_form(); ?>

			<?php endif; ?>

		</div><!-- .page-content -->
	</div><!-- .container -->
</main><!-- #main-content -->

<?php get_footer(); ?>
