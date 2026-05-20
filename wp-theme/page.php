<?php
/**
 * Generic Page Template
 *
 * @package CommonLadder
 */

get_header();
?>

<main id="main-content" role="main">
	<div class="container">
		<div class="page-content">

			<?php commonladder_breadcrumb(); ?>

			<?php while ( have_posts() ) : the_post(); ?>

			<article id="post-<?php the_ID(); ?>" <?php post_class(); ?> itemscope itemtype="https://schema.org/WebPage">

				<header class="page-header">
					<h1 class="page-header__title" itemprop="name"><?php the_title(); ?></h1>
					<?php if ( has_excerpt() ) : ?>
					<p class="page-header__description" itemprop="description"><?php the_excerpt(); ?></p>
					<?php endif; ?>
				</header>

				<?php if ( has_post_thumbnail() ) : ?>
				<img
					class="post-featured-image"
					src="<?php the_post_thumbnail_url( 'cl-hero' ); ?>"
					alt="<?php the_title_attribute(); ?>"
					width="1200"
					height="630"
					itemprop="image"
				>
				<?php endif; ?>

				<div class="entry-content" itemprop="articleBody">
					<?php
					the_content();
					wp_link_pages( array(
						'before' => '<nav class="page-links" aria-label="' . esc_attr__( 'Page break navigation', 'common-ladder' ) . '"><span class="page-links__label">' . esc_html__( 'Pages:', 'common-ladder' ) . '</span>',
						'after'  => '</nav>',
					) );
					?>
				</div>

			</article><!-- #post-<?php the_ID(); ?> -->

			<?php endwhile; ?>

		</div><!-- .page-content -->
	</div><!-- .container -->
</main><!-- #main-content -->

<?php get_footer(); ?>
