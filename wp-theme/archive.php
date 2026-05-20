<?php
/**
 * Archive Template
 *
 * Used for category, tag, author, date, and custom taxonomy archives.
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

			<!-- Archive Header -->
			<header class="page-header">
				<?php
				the_archive_title( '<h1 class="page-header__title">', '</h1>' );
				the_archive_description( '<p class="page-header__description">', '</p>' );
				?>
			</header>

			<!-- Post Grid -->
			<div class="archive-grid" role="list">

				<?php while ( have_posts() ) : the_post(); ?>

				<article
					id="post-<?php the_ID(); ?>"
					<?php post_class( 'post-card' ); ?>
					role="listitem"
					itemscope
					itemtype="https://schema.org/Article"
				>
					<meta itemprop="datePublished" content="<?php echo esc_attr( get_the_date( 'c' ) ); ?>">
					<?php if ( has_post_thumbnail() ) : ?>
					<a href="<?php the_permalink(); ?>" tabindex="-1" aria-hidden="true">
						<img
							class="post-card__image"
							src="<?php the_post_thumbnail_url( 'cl-card' ); ?>"
							alt=""
							loading="lazy"
							width="600"
							height="400"
							itemprop="image"
						>
					</a>
					<?php endif; ?>

					<div class="post-card__body">
						<?php
						$cats = get_the_category();
						if ( $cats ) :
						?>
						<a
							class="post-card__category"
							href="<?php echo esc_url( get_category_link( $cats[0]->term_id ) ); ?>"
							itemprop="articleSection"
						>
							<?php echo esc_html( $cats[0]->name ); ?>
						</a>
						<?php endif; ?>

						<h2 class="post-card__title">
							<a href="<?php the_permalink(); ?>" itemprop="url">
								<span itemprop="headline"><?php the_title(); ?></span>
							</a>
						</h2>

						<p class="post-card__excerpt" itemprop="description">
							<?php echo esc_html( get_the_excerpt() ); ?>
						</p>

						<div class="post-card__meta">
							<time
								class="post-card__date"
								datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"
							>
								<?php echo esc_html( get_the_date() ); ?>
							</time>
							<span class="post-card__read-time">
								<?php echo esc_html( commonladder_read_time() ); ?>
							</span>
						</div>
					</div><!-- .post-card__body -->
				</article>

				<?php endwhile; ?>

			</div><!-- .archive-grid -->

			<?php commonladder_pagination(); ?>

			<?php else : ?>

			<div class="error-page">
				<p class="error-page__title"><?php esc_html_e( 'Nothing found here yet.', 'common-ladder' ); ?></p>
				<p class="error-page__description"><?php esc_html_e( 'Try searching for what you need, or browse our resource categories.', 'common-ladder' ); ?></p>
				<?php get_search_form(); ?>
			</div>

			<?php endif; ?>

		</div><!-- .page-content -->
	</div><!-- .container -->
</main><!-- #main-content -->

<?php get_footer(); ?>
