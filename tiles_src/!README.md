The tiles were cut from the source images with GIMP
The imgaes and the tile catalog was created with Tiled.app

The size on one tile is typically is x=128 y=144 px
But the engine itself handles 64x144px tiles. The grid on one level is 16x7
Only 1/4 section of the last tile row is displayed.

After the level maps were created I asked chatgtp to enhance the images and make them look "better".
The final level map PNGs are in the final-tiled-images folder.


First, to try the level out, let's generate a black/white images from the collision data and the room tiles.
1- means wall or platform, 0 means empty space. These PNG need to be copied to the DATA/levels folder

They have a backlayer which is behind conrad and frontlayer which will be rendered on top.
At the end the two layers need to be merged and they must have their idexed colors in the correct slots.
4 slots for back, 4 for the front. 4*16 = 64 colors for each.