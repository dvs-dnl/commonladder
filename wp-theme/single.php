<?php
/**
 * Single Post Template
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

			<article
				id="post-<?php the_ID(); ?>"
				<?php post_class(); ?>
				itemscope
				itemtype="https://schema.org/Article"
			>
				<meta itemprop="datePublished" content="<?php echo esc_attr( get_the_date( 'c' ) ); ?>">
				<meta itemprop="dateModified" content="<?php echo esc_attr( get_the_modified_date( 'c' ) ); ?>">
				<?php if ( has_post_thumbnail() ) : ?>
				<meta itemprop="image" content="<?php the_post_thumbnail_url( 'full' ); ?>">
				<?php endif; ?>

				<!-- Post Header -->
				<header class="post-header">
					<div class="post-meta">
						<?php
						$cats = get_the_category();
						if ( $cats ) :
						?>
						<a
							class="post-meta__category"
							href="<?php echo esc_url( get_category_link( $cats[0]->term_id ) ); ?>"
							itemprop="articleSection"
						>
							<?php echo esc_html( $cats[0]->name ); ?>
						</a>
						<?php endif; ?>

						<time class="post-meta__date" datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>" itemprop="datePublished">
							<?php echo esc_html( get_the_date() ); ?>
						</time>

						<span class="post-meta__read-time">
							<?php echo esc_html( commonladder_read_time() ); ?>
						</span>
					</div>

					<h1 class="post-header__title" itemprop="headline">
						<?php the_title(); ?>
					</h1>

					<?php if ( has_excerpt() ) : ?>
					<p class="post-header__excerpt" itemprop="description">
						<?php the_excerpt(); ?>
					</p>
					<?php endif; ?>
				</header>

				<!-- Featured Image -->
				<?php if ( has_post_thumbnail() ) : ?>
				<figure>
					<img
						class="post-featured-image"
						src="<?php the_post_thumbnail_url( 'cl-hero' ); ?>"
						alt="<?php the_title_attribute(); ?>"
						width="1200"
						height="630"
					>
					<?php
					$caption = get_the_post_thumbnail_caption();
					if ( $caption ) :
					?>
					<figcaption><?php echo esc_html( $caption ); ?></figcaption>
					<?php endif; ?>
				</figure>
				<?php endif; ?>

				<!-- Post Body -->
				<div class="entry-content" itemprop="articleBody">
					<?php
					the_content( sprintf(
						/* translators: %s: post title */
						__( 'Continue reading<span class="sr-only"> "%s"</span>', 'common-ladder' ),
						get_the_title()
					) );

					wp_link_pages( array(
						'before' => '<nav class="page-links" aria-label="' . esc_attr__( 'Page break navigation', 'common-ladder' ) . '"><span>' . esc_html__( 'Pages:', 'common-ladder' ) . '</span>',
						'after'  => '</nav>',
					) );
					?>
				</div>

				<!-- Tags -->
				<?php
				$tags = get_the_tags();
				if ( $tags ) :
				?>
				<footer class="entry-footer">
					<nav aria-label="<?php esc_attr_e( 'Post tags', 'common-ladder' ); ?>">
						<?php
						foreach ( $tags as $tag ) :
						?>
						<a class="post-tag" href="<?php echo esc_url( get_tag_link( $tag->term_id ) ); ?>">
							#<?php echo esc_html( $tag->name ); ?>
						</a>
						<?php endforeach; ?>
					</nav>
				</footer>
				<?php endif; ?>

				<!-- Author Bio -->
				<?php
				$author_id    = get_the_author_meta( 'ID' );
				$author_name  = get_the_author();
				$author_bio   = get_the_author_meta( 'description' );
				$author_url   = get_author_posts_url( $author_id );
				if ( $author_name ) :
				?>
				<div class="author-bio" itemscope itemtype="https://schema.org/Person" itemprop="author">
					<?php
					$avatar_url = get_avatar_url( $author_id, array( 'size' => 128 ) );
					if ( $avatar_url ) :
					?>
					<img
						class="author-bio__avatar"
						src="<?php echo esc_url( $avatar_url ); ?>"
						alt=""
						width="64"
						height="64"
						aria-hidden="true"
					>
					<?php endif; ?>
					<div>
						<p class="author-bio__name">
							<?php esc_html_e( 'Written by', 'common-ladder' ); ?>
							<a href="<?php echo esc_url( $author_url ); ?>" itemprop="url">
								<span itemprop="name"><?php echo esc_html( $author_name ); ?></span>
							</a>
						</p>
						<?php if ( $author_bio ) : ?>
						<p class="author-bio__text" itemprop="description"><?php echo esc_html( $author_bio ); ?></p>
						<?php endif; ?>
					</div>
				</div>
				<?php endif; ?>

			</article><!-- #post-<?php the_ID(); ?> -->


			<!-- Related Posts -->
			<?php
			$current_id   = get_the_ID();
			$current_cats = wp_get_post_categories( $current_id );

			if ( ! empty( $current_cats ) ) :
				$related = new WP_Query( array(
					'post_type'           => 'post',
					'posts_per_page'      => 3,
					'post__not_in'        => array( $current_id ),
					'category__in'        => $current_cats,
					'ignore_sticky_posts' => true,
				) );

				if ( $related->have_posts() ) :
			?>
			<section class="related-posts" aria-labelledby="related-title">
				<h2 class="related-posts__title" id="related-title">
					<?php esc_html_e( 'Related resources', 'common-ladder' ); ?>
				</h2>
				<div class="related-posts__grid">
					<?php while ( $related->have_posts() ) : $related->the_post(); ?>
					<article class="post-card">
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
							<h3 class="post-card__title">
								<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
							</h3>
							<p class="post-card__excerpt"><?php echo esc_html( get_the_excerpt() ); ?></p>
						</div>
					</article>
					<?php endwhile; wp_reset_postdata(); ?>
				</div>
			</section>
			<?php
				endif;
			endif;
			?>

			<!-- Comments -->
			<?php
			if ( comments_open() || get_comments_number() ) {
				comments_template();
			}
			?>

			<!-- Post Navigation -->
			<nav class="post-navigation" aria-label="<?php esc_attr_e( 'Post navigation', 'common-ladder' ); ?>">
				<div>
					<?php
					$prev = get_previous_post();
					if ( $prev ) :
					?>
					<a class="post-navigation__prev" href="<?php echo esc_url( get_permalink( $prev ) ); ?>">
						&larr; <?php esc_html_e( 'Previous post', 'common-ladder' ); ?>
						<span class="post-navigation__title"><?php echo esc_html( $prev->post_title ); ?></span>
					</a>
					<?php endif; ?>
				</div>
				<div>
					<?php
					$next = get_next_post();
					if ( $next ) :
					?>
					<a class="post-navigation__next" href="<?php echo esc_url( get_permalink( $next ) ); ?>">
						<?php esc_html_e( 'Next post', 'common-ladder' ); ?> &rarr;
						<span class="post-navigation__title"><?php echo esc_html( $next->post_title ); ?></span>
					</a>
					<?php endif; ?>
				</div>
			</nav>

			<?php endwhile; ?>

		</div><!-- .page-content -->
	</div><!-- .container -->
</main><!-- #main-content -->

<?php get_footer(); ?>
